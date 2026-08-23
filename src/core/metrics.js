// src/core/metrics.js
// Métricas para /admin/overview: mensajes de hoy, usuarios únicos de hoy,
// costo acumulado del mes, actividad de los últimos 7 días.
//
// Dos implementaciones, misma interfaz:
//   - InMemoryMetricsStore: fallback de dev/tests, se pierde en cold start.
//   - KVMetricsStore: producción real, sobre el mismo binding KV "SESSIONS"
//     que usa session.js (prefijo "metrics:" para no chocar con "session:").
// createMetricsStore(env) elige automáticamente según exista env.SESSIONS.

function todayKey(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function monthKey() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/**
 * @typedef {Object} DayActivity
 * @property {string} date   - YYYY-MM-DD
 * @property {number} count  - mensajes ese día
 *
 * @typedef {Object} MetricsSnapshot
 * @property {number} messagesToday
 * @property {number} uniqueUsersToday
 * @property {number} costUsdThisMonth
 * @property {number} appointmentsToday
 * @property {number} handoffsToday
 * @property {string} lastMessageAt  - ISO string o "" si nunca hubo mensajes.
 * @property {DayActivity[]} last7Days - más antiguo primero, hoy al final.
 */

class InMemoryMetricsStore {
  constructor() {
    this._messagesByDay = new Map(); // "YYYY-MM-DD" -> count
    this._usersByDay = new Map(); // "YYYY-MM-DD" -> Set<externalUserId>
    this._costByMonth = new Map(); // "YYYY-MM" -> costUsd acumulado
    this._appointmentsByDay = new Map();
    this._handoffsByDay = new Map();
    this._lastMessageAt = "";
  }

  async recordMessage({ externalUserId, costUsd }) {
    const day = todayKey();
    const month = monthKey();
    this._messagesByDay.set(day, (this._messagesByDay.get(day) || 0) + 1);
    if (!this._usersByDay.has(day)) this._usersByDay.set(day, new Set());
    this._usersByDay.get(day).add(externalUserId);
    if (costUsd) this._costByMonth.set(month, (this._costByMonth.get(month) || 0) + costUsd);
    this._lastMessageAt = new Date().toISOString();
  }

  async recordAppointment() {
    const day = todayKey();
    this._appointmentsByDay.set(day, (this._appointmentsByDay.get(day) || 0) + 1);
  }

  async recordHandoff() {
    const day = todayKey();
    this._handoffsByDay.set(day, (this._handoffsByDay.get(day) || 0) + 1);
  }

  /** @returns {Promise<MetricsSnapshot>} */
  async snapshot() {
    const day = todayKey();
    const month = monthKey();
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = todayKey(i);
      last7Days.push({ date: d, count: this._messagesByDay.get(d) || 0 });
    }
    return {
      messagesToday: this._messagesByDay.get(day) || 0,
      uniqueUsersToday: this._usersByDay.get(day)?.size || 0,
      costUsdThisMonth: this._costByMonth.get(month) || 0,
      appointmentsToday: this._appointmentsByDay.get(day) || 0,
      handoffsToday: this._handoffsByDay.get(day) || 0,
      lastMessageAt: this._lastMessageAt,
      last7Days,
    };
  }
}

/**
 * Store respaldado en Cloudflare KV. Comparte el binding "SESSIONS" con
 * session.js bajo el prefijo "metrics:" (evita provisionar un segundo
 * namespace solo para métricas).
 *
 * Limitación conocida: KV no tiene incremento atómico. recordMessage() hace
 * read-modify-write, así que ráfagas de mensajes muy concurrentes al mismo
 * negocio pueden perder algún conteo. Aceptable para el volumen de un bot
 * por negocio; si se vuelve un problema real, migrar el contador a D1.
 */
class KVMetricsStore {
  constructor(kvNamespace) {
    this._kv = kvNamespace;
  }

  async _incr(key, by = 1, ttlSeconds) {
    const current = await this._kv.get(key);
    const next = (current ? parseFloat(current) : 0) + by;
    await this._kv.put(key, String(next), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined);
    return next;
  }

  async recordMessage({ externalUserId, costUsd }) {
    const day = todayKey();
    const month = monthKey();
    const THIRTY_DAYS = 30 * 24 * 60 * 60;

    await this._incr(`metrics:messages:${day}`, 1, THIRTY_DAYS);
    // Marca de "usuario visto hoy": TTL corto, se cuenta con list() en snapshot().
    await this._kv.put(`metrics:users:${day}:${externalUserId}`, "1", { expirationTtl: 2 * 24 * 60 * 60 });
    if (costUsd) await this._incr(`metrics:cost:${month}`, costUsd, 90 * 24 * 60 * 60);
    await this._kv.put("metrics:lastMessageAt", new Date().toISOString());
  }

  async recordAppointment() {
    const day = todayKey();
    await this._incr(`metrics:appointments:${day}`, 1, 30 * 24 * 60 * 60);
  }

  async recordHandoff() {
    const day = todayKey();
    await this._incr(`metrics:handoffs:${day}`, 1, 30 * 24 * 60 * 60);
  }

  async _countUniqueUsers(day) {
    let cursor;
    let count = 0;
    do {
      const page = await this._kv.list({ prefix: `metrics:users:${day}:`, cursor });
      count += page.keys.length;
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return count;
  }

  /** @returns {Promise<MetricsSnapshot>} */
  async snapshot() {
    const day = todayKey();
    const month = monthKey();

    const [messagesTodayRaw, costRaw, appointmentsRaw, handoffsRaw, lastMessageAt, uniqueUsersToday] =
      await Promise.all([
        this._kv.get(`metrics:messages:${day}`),
        this._kv.get(`metrics:cost:${month}`),
        this._kv.get(`metrics:appointments:${day}`),
        this._kv.get(`metrics:handoffs:${day}`),
        this._kv.get("metrics:lastMessageAt"),
        this._countUniqueUsers(day),
      ]);

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = todayKey(i);
      const raw = i === 0 ? messagesTodayRaw : await this._kv.get(`metrics:messages:${d}`);
      last7Days.push({ date: d, count: raw ? parseInt(raw, 10) : 0 });
    }

    return {
      messagesToday: messagesTodayRaw ? parseInt(messagesTodayRaw, 10) : 0,
      uniqueUsersToday,
      costUsdThisMonth: costRaw ? parseFloat(costRaw) : 0,
      appointmentsToday: appointmentsRaw ? parseInt(appointmentsRaw, 10) : 0,
      handoffsToday: handoffsRaw ? parseInt(handoffsRaw, 10) : 0,
      lastMessageAt: lastMessageAt || "",
      last7Days,
    };
  }
}

// Singleton compartido por isolate — fallback cuando no hay KV (dev/tests).
const _sharedMetrics = new InMemoryMetricsStore();

/**
 * @param {Record<string, any>} env
 */
export function createMetricsStore(env) {
  if (env?.SESSIONS && typeof env.SESSIONS.get === "function") {
    return new KVMetricsStore(env.SESSIONS);
  }
  return _sharedMetrics;
}

export { InMemoryMetricsStore, KVMetricsStore };
