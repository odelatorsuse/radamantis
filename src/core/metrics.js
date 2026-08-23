// src/core/metrics.js
// Métricas mínimas para /admin/overview: mensajes de hoy, usuarios únicos de
// hoy, costo acumulado del mes. MVP en memoria (se pierde en cold start);
// cuando el negocio tenga el KV "SESSIONS" provisionado, se puede promover a
// KVMetricsStore (misma interfaz) sin tocar el resto del código.
//
// Limitación conocida del store en memoria: no persiste entre despliegues ni
// entre isolates distintos de Cloudflare. Es suficiente para validar que el
// dashboard funciona; para producción real, usar KVMetricsStore.

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function monthKey() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/**
 * @typedef {Object} MetricsSnapshot
 * @property {number} messagesToday
 * @property {number} uniqueUsersToday
 * @property {number} costUsdThisMonth
 * @property {number} appointmentsToday
 * @property {string} lastMessageAt  - ISO string o "" si nunca hubo mensajes.
 */

class InMemoryMetricsStore {
  constructor() {
    this._messagesByDay = new Map(); // "YYYY-MM-DD" -> count
    this._usersByDay = new Map(); // "YYYY-MM-DD" -> Set<externalUserId>
    this._costByMonth = new Map(); // "YYYY-MM" -> costUsd acumulado
    this._appointmentsByDay = new Map(); // "YYYY-MM-DD" -> count (superpoder Google Calendar, aún no conectado)
    this._lastMessageAt = "";
  }

  async recordMessage({ externalUserId, costUsd }) {
    const day = todayKey();
    const month = monthKey();

    this._messagesByDay.set(day, (this._messagesByDay.get(day) || 0) + 1);

    if (!this._usersByDay.has(day)) this._usersByDay.set(day, new Set());
    this._usersByDay.get(day).add(externalUserId);

    if (costUsd) {
      this._costByMonth.set(month, (this._costByMonth.get(month) || 0) + costUsd);
    }

    this._lastMessageAt = new Date().toISOString();
  }

  async recordAppointment() {
    const day = todayKey();
    this._appointmentsByDay.set(day, (this._appointmentsByDay.get(day) || 0) + 1);
  }

  /** @returns {Promise<MetricsSnapshot>} */
  async snapshot() {
    const day = todayKey();
    const month = monthKey();
    return {
      messagesToday: this._messagesByDay.get(day) || 0,
      uniqueUsersToday: this._usersByDay.get(day)?.size || 0,
      costUsdThisMonth: this._costByMonth.get(month) || 0,
      appointmentsToday: this._appointmentsByDay.get(day) || 0,
      lastMessageAt: this._lastMessageAt,
    };
  }
}

// Singleton compartido por isolate (mismo patrón que session.js).
const _sharedMetrics = new InMemoryMetricsStore();

/**
 * @param {Record<string, any>} _env - reservado para cuando exista KV/D1.
 */
export function createMetricsStore(_env) {
  // TODO: cuando env.METRICS (o env.SESSIONS) esté provisionado, devolver
  // un KVMetricsStore aquí en vez del store en memoria.
  return _sharedMetrics;
}
