// src/core/router.js
// Dispatch de webhooks entrantes por canal. Cada integración
// (src/integrations/<channel>/index.js) debe exportar:
//   - parseIncoming(rawBody, headers, env) -> NormalizedMessage[]
//   - sendMessage(outgoing: OutgoingMessage, env) -> Promise<void>
//   - verifyWebhook(request, env) -> boolean | Promise<boolean>   (firma/verify token)
// Mientras esas integraciones están en STUB, este router expone también un
// canal "test" en memoria para poder ejercitar el pipeline completo
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

  const loader = INTEGRATION_MODULES[channel];
  if (!loader) throw new ChannelNotImplementedError(channel);

  const integration = await loader();
  if (typeof integration.parseIncoming !== "function") {
    throw new ChannelNotImplementedError(channel);
  }

  if (typeof integration.verifyWebhook === "function") {
    const valid = await integration.verifyWebhook(request, env);
    if (!valid) throw new Error(`Firma de webhook inválida para canal "${channel}"`);
  }

  const rawBody = await request.text();
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
