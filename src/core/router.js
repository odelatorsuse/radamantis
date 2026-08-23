// src/core/router.js
// Dispatch de webhooks entrantes por canal. Cada integración
// (src/integrations/<channel>/index.js) debe exportar:
//   - parseIncoming(rawBody, headers, env) -> NormalizedMessage[]
//   - sendMessage(outgoing: OutgoingMessage, env) -> Promise<void>
//   - verifyWebhook(request, rawBody, env) -> boolean | Promise<boolean>   (firma del POST)
//   - verifyWebhookChallenge(url, env) -> string | null                    (handshake GET, opcional)
// Mientras algunas integraciones siguen en STUB, este router expone también
// un canal "test" en memoria para poder ejercitar el pipeline completo
// (orchestrator + llm) sin depender de WhatsApp/Telegram/Meta reales.

import { handleIncomingMessage } from "./orchestrator.js";

const INTEGRATION_MODULES = {
  whatsapp: () => import("../integrations/whatsapp/index.js"),
  telegram: () => import("../integrations/telegram/index.js"),
  instagram: () => import("../integrations/instagram/index.js"),
  facebook: () => import("../integrations/facebook/index.js"),
};

export class ChannelNotImplementedError extends Error {
  constructor(channel) {
    super(`Integración de canal "${channel}" aún no implementada`);
    this.name = "ChannelNotImplementedError";
    this.channel = channel;
  }
}

/**
 * Construye un NormalizedMessage para pruebas/desarrollo local, sin pasar
 * por ninguna integración real.
 * @param {{conversationId: string, externalUserId?: string, text: string}} input
 * @returns {import("./types.js").NormalizedMessage}
 */
export function buildTestMessage({ conversationId, externalUserId, text }) {
  return {
    channel: "test",
    externalUserId: externalUserId || conversationId,
    conversationId,
    contentType: "text",
    text,
    timestamp: Date.now(),
  };
}

async function loadIntegration(channel) {
  const loader = INTEGRATION_MODULES[channel];
  if (!loader) throw new ChannelNotImplementedError(channel);
  const integration = await loader();
  if (typeof integration.parseIncoming !== "function") {
    throw new ChannelNotImplementedError(channel);
  }
  return integration;
}

/**
 * Handshake de verificación GET (Meta/WhatsApp, y otros proveedores que usen
 * el mismo patrón hub.challenge). Devuelve el challenge a responder en texto
 * plano, o null si el canal no soporta/valida el handshake.
 * @param {string} channel
 * @param {URL} url
 * @param {Record<string, any>} env
 * @returns {Promise<string | null>}
 */
export async function handleWebhookVerification(channel, url, env) {
  const integration = await loadIntegration(channel);
  if (typeof integration.verifyWebhookChallenge !== "function") return null;
  return integration.verifyWebhookChallenge(url, env);
}

/**
 * Procesa un webhook entrante de un canal soportado: parsea, ejecuta el
 * pipeline del orchestrator por cada mensaje normalizado, y envía la
 * respuesta de vuelta por el mismo canal.
 *
 * @param {string} channel
 * @param {Request} request
 * @param {Record<string, any>} env
 * @returns {Promise<import("./types.js").OutgoingMessage[]>}
 */
export async function handleWebhook(channel, request, env) {
  if (channel === "test") {
    throw new Error('El canal "test" se usa vía handleIncomingMessage/buildTestMessage directamente, no por webhook.');
  }

  const integration = await loadIntegration(channel);

  // El body se lee UNA sola vez (Request.text() no es reentrante) porque
  // verifyWebhook (firma HMAC) también lo necesita crudo.
  const rawBody = await request.text();

  if (typeof integration.verifyWebhook === "function") {
    const valid = await integration.verifyWebhook(request, rawBody, env);
    if (!valid) throw new Error(`Firma de webhook inválida para canal "${channel}"`);
  }

  const messages = await integration.parseIncoming(rawBody, request.headers, env);

  const replies = [];
  for (const message of messages) {
    const reply = await handleIncomingMessage(message, env);
    if (typeof integration.sendMessage === "function") {
      await integration.sendMessage(reply, env);
    }
    replies.push(reply);
  }
  return replies;
}
