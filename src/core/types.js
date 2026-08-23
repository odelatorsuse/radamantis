// src/core/types.js
// Envelope normalizado que usan TODOS los módulos internos (orchestrator,
// superpowers, analytics). Cada integración de canal (whatsapp, telegram,
// instagram, facebook) es responsable de convertir su payload nativo a esto.

/**
 * @typedef {"whatsapp"|"telegram"|"instagram"|"facebook"|"test"} Channel
 * @typedef {"text"|"audio"|"image"|"document"|"location"} ContentType
 *
 * @typedef {Object} NormalizedMessage
 * @property {Channel} channel
 * @property {string} externalUserId      - ID del usuario en el canal origen (ej. número WA).
 * @property {string} conversationId      - Identificador estable de la conversación (para sesión).
 * @property {ContentType} contentType
 * @property {string} [text]              - Texto del mensaje (o transcripción si contentType=audio).
 * @property {string} [mediaUrl]          - URL/id de media si aplica (audio, imagen, doc).
 * @property {number} timestamp           - epoch ms.
 * @property {unknown} [raw]              - Payload original del canal (para debug/auditoría).
 *
 * @typedef {Object} OutgoingMessage
 * @property {Channel} channel
 * @property {string} externalUserId
 * @property {string} text
 * @property {Object} [meta]              - provider, model, tokensUsed, costUsd, etc.
 *
 * @typedef {Object} SessionMessage
 * @property {"user"|"assistant"} role
 * @property {string} content
 * @property {number} timestamp
 *
 * @typedef {Object} Session
 * @property {string} conversationId
 * @property {Channel} channel
 * @property {string} externalUserId
 * @property {SessionMessage[]} history
 * @property {Object} state               - Estado libre para superpoderes (ej. handoff activo, encuesta pendiente).
 * @property {number} createdAt
 * @property {number} updatedAt
 */

export {};
