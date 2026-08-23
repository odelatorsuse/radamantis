// src/core/orchestrator.js
// Pipeline central: mensaje normalizado -> sesión -> LLM -> respuesta.
// Superpoderes enganchados acá (los 12, ver docs/CHECKLIST.md por detalle
// de cada uno):
//   ANTES del LLM:  oído/vista (transcribe audio, describe imagen),
//                    encuestas (intercepta la respuesta 1-5 si estábamos
//                    esperándola), cobros (genera link de pago si aplica),
//                    blindaje + voz de marca + multiidioma (arman el system prompt)
//   DESPUÉS del LLM: vigilante (riesgo/frustración), handoff, encuestas
//                    (agrega la pregunta CSAT), reseñas (la pide si CSAT alto)
// cazador y reactivación (#3, #10) NO viven acá — son sweeps de cron sobre
// todas las sesiones, ver src/core/index.js `scheduled` y
// src/superpowers/{cazador,reactivacion}/index.js.

import { createLLMRouter, LLMProviderError } from "../llm/index.js";
import { createSessionStore, createEmptySession, appendMessage } from "./session.js";
import { createMetricsStore } from "./metrics.js";
import { detectRisk, alertAdmin } from "../superpowers/vigilante/index.js";
import { detectHandoffRequest, escalate } from "../superpowers/handoff/index.js";
import { transcribeAudio, describeImage } from "../superpowers/oido_vista/index.js";
import { detectLanguage, buildLanguageHint } from "../superpowers/multiidioma/index.js";
import { shouldSendSurvey, buildSurveyMessage, isAwaitingSurveyReply, parseCsatResponse } from "../superpowers/encuestas/index.js";
import { shouldRequestReview, buildReviewRequestMessage } from "../superpowers/resenas/index.js";
import { detectPaymentIntent, createPaymentLink } from "../superpowers/cobros/index.js";
import { buildGroundingInstruction } from "../superpowers/blindaje/index.js";
import { buildBrandVoiceInstruction } from "../superpowers/voz_marca/index.js";

function buildSystemPrompt(env, detectedLanguage) {
  return [buildBrandVoiceInstruction(env), buildGroundingInstruction(), buildLanguageHint(detectedLanguage)]
    .filter(Boolean)
    .join("\n");
}

// oído/vista: convierte audio/imagen a texto ANTES de tocar la sesión. Si la
// transcripción/descripción falla (media inaccesible, falta OPENAI_API_KEY,
// etc.) no tumba el pipeline — se le pide al cliente que lo repita en texto.
async function normalizeToText(message, env) {
  if (message.contentType === "audio") {
    try {
      const text = await transcribeAudio(message.mediaUrl, env);
      return { ...message, contentType: "text", text: text || "(nota de voz vacía)" };
    } catch (err) {
      console.error("[oido_vista] no se pudo transcribir el audio:", err?.message || err);
      return { ...message, contentType: "text", text: "(el cliente envió una nota de voz que no pude transcribir — pídele que lo escriba)" };
    }
  }
  if (message.contentType === "image") {
    try {
      const description = await describeImage(message.mediaUrl, env, { caption: message.text });
      return { ...message, contentType: "text", text: description || "(imagen sin descripción disponible)" };
    } catch (err) {
      console.error("[oido_vista] no se pudo describir la imagen:", err?.message || err);
      return { ...message, contentType: "text", text: "(el cliente envió una imagen que no pude analizar — pídele que describa lo que necesita)" };
    }
  }
  return message;
}

/**
 * @param {import("./types.js").NormalizedMessage} rawMessage
 * @param {Record<string, any>} env
 * @param {Object} [opts]
 * @param {string} [opts.systemPrompt]   - Override (ej. desde voz_marca/blindaje ya resueltos).
 * @returns {Promise<import("./types.js").OutgoingMessage>}
 */
export async function handleIncomingMessage(rawMessage, env, opts = {}) {
  if (!rawMessage?.conversationId) {
    throw new Error("handleIncomingMessage: message.conversationId es requerido");
  }

  const message = await normalizeToText(rawMessage, env);

  if (message.contentType !== "text" || !message.text) {
    throw new Error(
      `handleIncomingMessage: contentType "${message.contentType}" aún no soportado (falta superpoder oido_vista)`
    );
  }

  const sessionStore = createSessionStore(env);
  const metrics = createMetricsStore(env);
  let session = await sessionStore.get(message.conversationId);
  if (!session) {
    session = createEmptySession(message.conversationId, message.channel, message.externalUserId);
  }

  // Superpoder encuestas: si le habíamos preguntado CSAT en el turno
  // anterior, intenta interpretar la respuesta ANTES que nada — si el
  // cliente respondió con un número, no hace falta gastar una llamada al
  // LLM para esto.
  if (isAwaitingSurveyReply(session)) {
    const rating = parseCsatResponse(message.text);
    if (rating !== null) {
      appendMessage(session, "user", message.text);
      session.state = { ...session.state, surveyResponse: rating };
      await metrics.recordCsat(rating);

      let thankYouText = "¡Gracias por tu respuesta! 🙌";
      if (shouldRequestReview(session, env)) {
        thankYouText += ` ${buildReviewRequestMessage(env)}`;
        session.state = { ...session.state, reviewRequestedAt: Date.now() };
      }
      appendMessage(session, "assistant", thankYouText);
      await sessionStore.save(session);

      return {
        channel: message.channel,
        externalUserId: message.externalUserId,
        text: thankYouText,
        meta: { provider: "radamantis", model: "encuestas", surveyResponse: rating },
      };
    }
    // No se pudo interpretar como calificación — probablemente el cliente
    // escribió otra cosa. Sigue el flujo normal.
  }

  appendMessage(session, "user", message.text);

  // Superpoder cobros: si el cliente pide pagar y el negocio tiene Stripe +
  // un precio por defecto configurado, se genera el link directo, sin pasar
  // por el LLM (más rápido y no hay ambigüedad que un modelo pueda inventar).
  if (detectPaymentIntent(message.text) && env?.STRIPE_SECRET_KEY && env?.DEFAULT_SERVICE_PRICE_USD) {
    try {
      const link = await createPaymentLink(
        { amountUsd: Number(env.DEFAULT_SERVICE_PRICE_USD), description: env?.BUSINESS_DISPLAY_NAME || "Servicio" },
        env
      );
      const replyText = `Aquí tienes tu link de pago seguro: ${link.url}`;
      appendMessage(session, "assistant", replyText);
      await sessionStore.save(session);
      await metrics.recordMessage({ externalUserId: message.externalUserId, costUsd: 0 });

      return {
        channel: message.channel,
        externalUserId: message.externalUserId,
        text: replyText,
        meta: { provider: "radamantis", model: "cobros", paymentLinkUrl: link.url },
      };
    } catch (err) {
      console.error("[cobros] no se pudo generar el link de pago, sigue el flujo normal:", err?.message || err);
    }
  }

  const detectedLanguage = detectLanguage(message.text);
  const llmRouter = createLLMRouter(env);
  const chatMessages = session.history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let response;
  try {
    response = await llmRouter.chat({
      messages: chatMessages,
      system: opts.systemPrompt || buildSystemPrompt(env, detectedLanguage),
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

  await metrics.recordMessage({
    externalUserId: message.externalUserId,
    costUsd: response.usage.costUsd,
  });

  // Superpoder vigilante: heurística de riesgo/frustración sobre el mensaje
  // entrante del usuario. Si hay señal, alerta al admin por WhatsApp — no
  // bloquea ni altera la respuesta normal al cliente si falla.
  const risk = detectRisk(message.text);
  if (risk.risk) {
    await alertAdmin({ session, messageText: message.text, risk }, env);
  }

  // Superpoder handoff: detecta pedido explícito de hablar con un humano y
  // escala con resumen estructurado. Se cuenta en métricas para el dashboard
  // ("resueltas sin humano" = mensajesHoy - handoffsHoy).
  const escalatedToHuman = detectHandoffRequest(message.text);
  if (escalatedToHuman) {
    await escalate({ session, messageText: message.text }, env);
    await metrics.recordHandoff();
    await sessionStore.save(session); // persiste session.state.handoffRequestedAt
  }

  // Superpoder encuestas: si toca preguntar CSAT en este turno, se agrega al
  // final de la respuesta (pero NO se guarda como parte del historial que ve
  // el LLM — se mantiene fuera de `response.text` en session.history).
  let finalReplyText = response.text;
  if (!escalatedToHuman && shouldSendSurvey(session)) {
    finalReplyText = `${response.text}\n\n${buildSurveyMessage()}`;
    session.state = { ...session.state, surveySentAt: Date.now() };
    await sessionStore.save(session);
  }

  // TODO(costos_presupuesto): cortar/alertar si costUsdThisMonth supera
  //   env.LLM_MONTHLY_BUDGET_USD (metrics.snapshot() ya trae el acumulado).

  return {
    channel: message.channel,
    externalUserId: message.externalUserId,
    text: finalReplyText,
    meta: {
      provider: response.provider,
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costUsd: response.usage.costUsd,
      stopReason: response.stopReason,
      riskDetected: risk.risk,
      riskSeverity: risk.severity,
      escalatedToHuman,
      detectedLanguage,
    },
  };
}
