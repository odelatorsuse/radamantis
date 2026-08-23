// src/core/session.js
// Store de sesiones de conversación. Implementación en memoria para
// desarrollo/tests; en producción sobre Cloudflare Workers se reemplaza por
// un store respaldado en KV o Durable Objects (binding SESSIONS, ver
// wrangler.toml) implementando la misma interfaz.

const MAX_HISTORY_MESSAGES = 20; // ventana de contexto enviada al LLM

/**
 * @typedef {Object} SessionStore
 * @property {(conversationId: string) => Promise<import("./types.js").Session|null>} get
 * @property {(session: import("./types.js").Session) => Promise<void>} save
 * @property {() => Promise<import("./types.js").Session[]>} listAll - usado
 *   por los sweeps de cron (cazador, reactivación). Puede ser costoso en KV
 *   a gran escala (ver advertencia en KVSessionStore.listAll) — aceptable
 *   para el volumen de un bot por negocio en el MVP.
 */

/**
 * @param {string} conversationId
 * @param {import("./types.js").Channel} channel
 * @param {string} externalUserId
 * @returns {import("./types.js").Session}
 */
export function createEmptySession(conversationId, channel, externalUserId) {
  const now = Date.now();
  return {
    conversationId,
    channel,
    externalUserId,
    history: [],
    state: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Agrega un mensaje al historial, recortando a la ventana máxima.
 * @param {import("./types.js").Session} session
 * @param {"user"|"assistant"} role
 * @param {string} content
 */
export function appendMessage(session, role, content) {
  session.history.push({ role, content, timestamp: Date.now() });
  if (session.history.length > MAX_HISTORY_MESSAGES) {
    session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
  }
  session.updatedAt = Date.now();
}

/** @implements {SessionStore} */
export class InMemorySessionStore {
  constructor() {
    /** @type {Map<string, import("./types.js").Session>} */
    this._sessions = new Map();
  }

  async get(conversationId) {
    return this._sessions.get(conversationId) ?? null;
  }

  async save(session) {
    this._sessions.set(session.conversationId, session);
  }

  async listAll() {
    return Array.from(this._sessions.values());
  }
}

/**
 * Store respaldado en Cloudflare KV. Requiere un binding KV (ej. env.SESSIONS)
 * declarado en wrangler.toml. TTL por defecto: 7 días de inactividad.
 * @implements {SessionStore}
 */
export class KVSessionStore {
  /**
   * @param {KVNamespace} kvNamespace
   * @param {number} [ttlSeconds=604800]
   */
  constructor(kvNamespace, ttlSeconds = 604800) {
    this._kv = kvNamespace;
    this._ttl = ttlSeconds;
  }

  async get(conversationId) {
    const raw = await this._kv.get(`session:${conversationId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async save(session) {
    await this._kv.put(
      `session:${session.conversationId}`,
      JSON.stringify(session),
      { expirationTtl: this._ttl }
    );
  }

  // Usado por los sweeps de cron (cazador, reactivación de leads). KV no
  // tiene consultas por rango de fecha: se listan TODAS las claves
  // "session:*" (paginado por cursor) y se hace el get uno por uno. Acotado
  // para el volumen de un bot por negocio — si esto se vuelve un cuello de
  // botella real, migrar el índice de sesiones activas a D1.
  async listAll() {
    const sessions = [];
    let cursor;
    do {
      const page = await this._kv.list({ prefix: "session:", cursor });
      const values = await Promise.all(page.keys.map((k) => this._kv.get(k.name)));
      for (const raw of values) {
        if (raw) {
          try {
            sessions.push(JSON.parse(raw));
          } catch {
            // entrada corrupta/parcial — se ignora en vez de tumbar el sweep completo.
          }
        }
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return sessions;
  }
}

// Singleton de fallback: dentro de un mismo isolate/proceso (dev, tests),
// todas las llamadas sin KV comparten el mismo store en memoria en vez de
// crear uno nuevo por request, que perdería el historial en cada turno.
const _sharedInMemoryStore = new InMemorySessionStore();

/**
 * Selecciona el store adecuado según el entorno: si existe env.SESSIONS
 * (binding KV de Cloudflare) usa KVSessionStore; si no, cae al store en
 * memoria compartido del proceso (útil en tests y en `wrangler dev` sin KV
 * configurado; en producción SIEMPRE se debe configurar el binding KV,
 * porque la memoria no sobrevive a un reinicio del isolate).
 * @param {Record<string, any>} env
 * @returns {SessionStore}
 */
export function createSessionStore(env) {
  if (env?.SESSIONS && typeof env.SESSIONS.get === "function") {
    return new KVSessionStore(env.SESSIONS);
  }
  return _sharedInMemoryStore;
}
