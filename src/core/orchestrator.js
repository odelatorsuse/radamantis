// src/core/orchestrator.js
// Pipeline central: mensaje normalizado -> sesión -> LLM -> respuesta.
// Este es el punto donde, a futuro, se enganchan los superpoderes:
//   - ANTES del LLM:  blindaje (contexto RAG), multiidioma (detección), vigilante (pre-check)
//   - DESPUÉS del LLM: vigilante (sentimiento de la respuesta/usuario), handoff, encuestas, cobros
// Por ahora esos hooks son no-ops documentados (ver TODOs) para no bloquear
// el flujo base mensaje -> respuesta, que es lo que este módulo garantiza.

import { createLLMRouter, LLMProviderError } from "../llm/index.js";
import { createSessionStore, createEmptySession, appendMessage } from "./session.js";
import { createMetricsStore } from "./metrics.js";

// Prompt base de "blindaje anti-invento" (superpoder #1) + "voz de marca"
// (superpoder #6, piso mínimo vía env vars del negocio). La versión completa
// con RAG estricto vive en src/superpowers/blindaje; esto es el mínimo
// mientras ese módulo se implementa.
function buildSystemPrompt(env) {
  const businessName = env?.BUSINESS_DISPLAY_NAME || "la marca";
  const extra = env?.SYSTEM_PROMPT_EXTRA || "";
  return `Eres el asistente virtual de ${businessName}. Responde de forma clara, concisa y en el idioma del usuario.
Si no tienes certeza sobre un dato (precios, disponibilidad, políticas, horarios), NO inventes: dilo explícitamente
y ofrece confirmarlo ("déjame confirmarlo y te aviso") en lugar de adivinar.
${extra}`.trim();
}

/**
 * @param {import("./types.js").NormalizedMessage} message
 * @param {Record<string, any>} env
 * @param {Object} [opts]
 * @param {string} [opts.systemPrompt]   - Override (ej. desde voz_marca/blindaje ya resueltos).
 * @returns {Promise<import("./types.js").OutgoingMessage>}
 */
export async function handleIncomingMessage(message, env, opts = {}) {
  if (!message?.conversationId) {
    throw new Error("handleIncomingMessage: message.conversationId es requerido");
  }
  if (message.contentType !== "text" || !message.text) {
    // TODO(oido_vista): transcribir audio (Whisper) / describir imagen antes de este punto.
    throw new Error(
      `handleIncomingMessage: contentType "${message.contentType}" aún no soportado (falta superpoder oido_vista)`
    );
  }

  const sessionStore = createSessionStore(env);
  let session = await sessionStore.get(message.conversationId);
  if (!session) {
    session = createEmptySession(
      message.conversationId,
      message.channel,
      message.externalUserId
    );
  }

  appendMessage(session, "user", message.text);

  const llmRouter = createLLMRouter(env);
  const chatMessages = session.history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let response;
  try {
    response = await llmRouter.chat({
      messages: chatMessages,
      system: opts.systemPrompt || buildSystemPrompt(env),
    });
  } catch (err) {
    // No persistimos el turno fallido en el historial del usuario; se guarda
    // igual la sesión para no perder el mensaje entrante.
    await sessionStore.save(session);
    if (err instanceof LLMProviderError) throw err;
    throw new LLMProviderError(err?.message || "Fallo desconocido del router LLM", {
      provider: "router",
      retryable: false,
      cause: err,
    });
  }

  appendMessage(session, "assistant", response.text);
  await sessionStore.save(session);

  const metrics = createMetricsStore(env);
  await metrics.recordMessage({
    externalUserId: message.externalUserId,
    costUsd: response.usage.costUsd,
  });

  // TODO(vigilante): analizar sentimiento de `message.text` y de la sesión;
  //   si hay frustración/riesgo, disparar alerta push a WhatsApp admin aquí.
  // TODO(costos_presupuesto): cortar/alertar si costUsdThisMonth supera
  //   env.LLM_MONTHLY_BUDGET_USD (metrics.snapshot() ya trae el acumulado).

  return {
    channel: message.channel,
    externalUserId: message.externalUserId,
    text: response.text,
    meta: {
      provider: response.provider,
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costUsd: response.usage.costUsd,
      stopReason: response.stopReason,
    },
  };
}
