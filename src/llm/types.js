// src/llm/types.js
// Contrato común que TODOS los adaptadores LLM (claude, openai, gemini, grok)
// deben cumplir. El router (index.js) depende únicamente de esta interfaz,
// nunca de detalles internos de un proveedor.

/**
 * @typedef {"system"|"user"|"assistant"} ChatRole
 *
 * @typedef {Object} ChatMessage
 * @property {ChatRole} role
 * @property {string} content
 *
 * @typedef {Object} ChatRequest
 * @property {ChatMessage[]} messages   - Historial de la conversación (sin el system prompt).
 * @property {string} [system]          - Instrucción de sistema (voz de marca, grounding, etc).
 * @property {number} [maxTokens=1024]
 * @property {number} [temperature=0.7]
 * @property {string} [model]           - Override del modelo por defecto del adaptador.
 *
 * @typedef {Object} ChatUsage
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} costUsd           - Costo estimado de esta llamada.
 *
 * @typedef {Object} ChatResponse
 * @property {string} text              - Respuesta del modelo.
 * @property {string} provider          - "claude" | "openai" | "gemini" | "grok".
 * @property {string} model             - Modelo exacto usado.
 * @property {ChatUsage} usage
 * @property {"end_turn"|"max_tokens"|"stop_sequence"|"error"} stopReason
 * @property {unknown} [raw]            - Respuesta cruda del proveedor (debug/auditoría).
 */

/**
 * Error estándar para fallos de proveedor LLM. Permite al router decidir si
 * reintentar, hacer fallback a otro proveedor, o propagar el error.
 */
export class LLMProviderError extends Error {
  /**
   * @param {string} message
   * @param {Object} opts
   * @param {string} opts.provider
   * @param {number} [opts.status]        - HTTP status si aplica.
   * @param {boolean} [opts.retryable]    - true si tiene sentido reintentar / fallback.
   * @param {unknown} [opts.cause]
   */
  constructor(message, { provider, status, retryable = false, cause } = {}) {
    super(message);
    this.name = "LLMProviderError";
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

/**
 * Interfaz que debe implementar cada adaptador.
 * @typedef {Object} LLMAdapter
 * @property {string} providerName
 * @property {(request: ChatRequest, env: Record<string, string>) => Promise<ChatResponse>} chat
 */

/**
 * Busca la tarifa de un modelo en una tabla de precios, tolerando que el
 * proveedor devuelva una variante fechada (ej. pedimos "gpt-4o" y la API
 * responde "gpt-4o-2024-08-06"). Intenta match exacto primero; si no,
 * busca la clave MÁS LARGA de la que `model` sea prefijo (para no
 * confundir "gpt-4o" con "gpt-4o-mini").
 * @param {Record<string, {input: number, output: number}>} table
 * @param {string} model
 */
export function matchPricing(table, model) {
  if (table[model]) return table[model];
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model.startsWith(key)) return table[key];
  }
  return null;
}
