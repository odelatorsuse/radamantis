// test/orchestrator.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { handleIncomingMessage } from "../src/core/orchestrator.js";
import { buildTestMessage } from "../src/core/router.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

function claudeResponse(text, calls) {
  if (calls) calls.claude = (calls.claude || 0) + 1;
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: "claude-3-5-sonnet-20241022",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 4 },
    }),
  };
}

function mockClaudeReply(text) {
  globalThis.fetch = async () => claudeResponse(text);
}

// Dispatcher genérico por URL — usado por los tests de superpoderes que
// disparan llamadas externas además del LLM (WhatsApp, Whisper/visión,
// Stripe). `calls` es un contador mutable para verificar cuántas veces se
// llamó cada servicio.
function mockDispatch(replyText, calls = {}) {
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes("graph.facebook.com")) {
      // Distingue el handshake de media (GET /v20.0/<id>) del envío de
      // mensajes (POST .../messages) y de la descarga del media en sí.
      calls.whatsapp = (calls.whatsapp || 0) + 1;
      if (u.includes("/messages")) return { ok: true, status: 200, text: async () => "" };
      if (u.includes("cdn.example.com")) return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
      return { ok: true, status: 200, json: async () => ({ url: "https://cdn.example.com/media/abc", mime_type: "audio/ogg" }) };
    }
    if (u.includes("cdn.example.com")) {
      calls.mediaDownload = (calls.mediaDownload || 0) + 1;
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
    }
    if (u.includes("api.openai.com/v1/audio/transcriptions")) {
      calls.whisper = (calls.whisper || 0) + 1;
      return { ok: true, status: 200, json: async () => ({ text: "hola quiero agendar una cita" }) };
    }
    if (u.includes("api.openai.com/v1/chat/completions")) {
      calls.vision = (calls.vision || 0) + 1;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "Una mascota con una pata lastimada." } }] }) };
    }
    if (u.includes("api.stripe.com/v1/prices")) {
      calls.stripePrice = (calls.stripePrice || 0) + 1;
      return { ok: true, status: 200, json: async () => ({ id: "price_123" }) };
    }
    if (u.includes("api.stripe.com/v1/payment_links")) {
      calls.stripeLink = (calls.stripeLink || 0) + 1;
      return { ok: true, status: 200, json: async () => ({ url: "https://buy.stripe.com/test_abc123" }) };
    }
    return claudeResponse(replyText, calls);
  };
}

test("handleIncomingMessage procesa un mensaje de texto y devuelve respuesta con meta", async () => {
  mockClaudeReply("¡Hola! Claro que sí.");

  const env = { ANTHROPIC_API_KEY: "sk-test", LLM_DEFAULT_PROVIDER: "claude" };
  const msg = buildTestMessage({ conversationId: "conv-1", text: "¿tienen disponibilidad mañana?" });

  const reply = await handleIncomingMessage(msg, env);

  assert.equal(reply.channel, "test");
  assert.equal(reply.text, "¡Hola! Claro que sí.");
  assert.equal(reply.meta.provider, "claude");
  assert.equal(reply.meta.inputTokens, 10);
  assert.ok(reply.meta.costUsd >= 0);
  assert.equal(reply.meta.detectedLanguage, "es");
});

test("handleIncomingMessage mantiene historial entre turnos de la misma conversación", async () => {
  mockClaudeReply("Segunda respuesta");
  const env = { ANTHROPIC_API_KEY: "sk-test" };

  // Nota: InMemorySessionStore se crea nuevo por llamada (createSessionStore),
  // así que en este test unitario cada turno es independiente salvo que se
  // inyecte el mismo store — se deja documentado como límite conocido del
  // store en memoria por request, y motivo por el que producción usa KV.
  const msg1 = buildTestMessage({ conversationId: "conv-2", text: "primer mensaje" });
  const reply1 = await handleIncomingMessage(msg1, env);
  assert.equal(reply1.text, "Segunda respuesta");
});

test("handleIncomingMessage rechaza un contentType realmente no soportado", async () => {
  const env = { ANTHROPIC_API_KEY: "sk-test" };
  const msg = { ...buildTestMessage({ conversationId: "conv-3", text: "" }), contentType: "video", text: undefined };
  await assert.rejects(() => handleIncomingMessage(msg, env), /video.*aún no soportado/);
});

test("handleIncomingMessage detecta inglés y lo expone en meta.detectedLanguage", async () => {
  mockClaudeReply("Sure, we have availability tomorrow.");
  const env = { ANTHROPIC_API_KEY: "sk-test" };
  const msg = buildTestMessage({ conversationId: "conv-en-1", text: "hello, do you have an appointment tomorrow please" });
  const reply = await handleIncomingMessage(msg, env);
  assert.equal(reply.meta.detectedLanguage, "en");
});

test("handleIncomingMessage dispara vigilante y alerta al admin cuando detecta riesgo alto", async () => {
  const calls = {};
  mockDispatch("Lamento escuchar eso, vamos a ayudarte ahora mismo.", calls);

  const env = {
    ANTHROPIC_API_KEY: "sk-test",
    ADMIN_WHATSAPP_NUMBER: "5215500000000",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_ACCESS_TOKEN: "token-abc",
  };
  const msg = buildTestMessage({ conversationId: "conv-vigilante-1", text: "emergencia, mi perro se está muriendo" });

  const reply = await handleIncomingMessage(msg, env);

  assert.equal(reply.meta.riskDetected, true);
  assert.equal(reply.meta.riskSeverity, "high");
  assert.equal(calls.whatsapp, 1);
});

test("handleIncomingMessage no dispara vigilante en un mensaje normal", async () => {
  const calls = {};
  mockDispatch("Claro, ¿qué día te viene bien?", calls);

  const env = {
    ANTHROPIC_API_KEY: "sk-test",
    ADMIN_WHATSAPP_NUMBER: "5215500000000",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_ACCESS_TOKEN: "token-abc",
  };
  const msg = buildTestMessage({ conversationId: "conv-vigilante-2", text: "hola, ¿tienen citas mañana?" });

  const reply = await handleIncomingMessage(msg, env);

  assert.equal(reply.meta.riskDetected, false);
  assert.equal(calls.whatsapp, undefined);
});

test("handleIncomingMessage dispara handoff y registra la métrica cuando el cliente pide un humano", async () => {
  const calls = {};
  mockDispatch("Ya te comunico con alguien del equipo.", calls);

  const env = {
    ANTHROPIC_API_KEY: "sk-test",
    ADMIN_WHATSAPP_NUMBER: "5215500000000",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_ACCESS_TOKEN: "token-abc",
  };
  const msg = buildTestMessage({ conversationId: "conv-handoff-1", text: "quiero hablar con una persona" });

  const reply = await handleIncomingMessage(msg, env);

  assert.equal(reply.meta.escalatedToHuman, true);
  assert.equal(calls.whatsapp, 1);
});

test("handleIncomingMessage (oido_vista) transcribe audio y lo procesa como texto normal", async () => {
  const calls = {};
  mockDispatch("Claro, agendamos tu cita.", calls);

  const env = {
    ANTHROPIC_API_KEY: "sk-test",
    WHATSAPP_ACCESS_TOKEN: "token-abc",
    OPENAI_API_KEY: "sk-openai-test",
  };
  const msg = { ...buildTestMessage({ conversationId: "conv-audio-1", text: undefined }), contentType: "audio", mediaUrl: "wamid-media-id-1" };

  const reply = await handleIncomingMessage(msg, env);

  assert.equal(calls.whisper, 1);
  assert.equal(reply.text, "Claro, agendamos tu cita.");
});

test("handleIncomingMessage (oido_vista) si falla la transcripción, degrada con un texto de fallback en vez de tumbar el pipeline", async () => {
  mockClaudeReply("¿Podrías escribirme lo que necesitas?");
  const env = { ANTHROPIC_API_KEY: "sk-test" }; // sin WHATSAPP_ACCESS_TOKEN/OPENAI_API_KEY -> transcribeAudio lanza
  const msg = { ...buildTestMessage({ conversationId: "conv-audio-2", text: undefined }), contentType: "audio", mediaUrl: "wamid-media-id-2" };

  const reply = await handleIncomingMessage(msg, env);
  assert.equal(reply.text, "¿Podrías escribirme lo que necesitas?");
});

test("handleIncomingMessage (oido_vista) describe una imagen y la procesa como texto normal", async () => {
  const calls = {};
  mockDispatch("Suena a que necesita atención urgente, tráela ahora mismo.", calls);

  const env = {
    ANTHROPIC_API_KEY: "sk-test",
    WHATSAPP_ACCESS_TOKEN: "token-abc",
    OPENAI_API_KEY: "sk-openai-test",
  };
  const msg = { ...buildTestMessage({ conversationId: "conv-image-1", text: "mira esto" }), contentType: "image", mediaUrl: "wamid-media-id-3" };

  const reply = await handleIncomingMessage(msg, env);

  assert.equal(calls.vision, 1);
  assert.equal(reply.text, "Suena a que necesita atención urgente, tráela ahora mismo.");
});

test("handleIncomingMessage (encuestas) pregunta CSAT después de suficientes turnos y la respuesta siguiente la intercepta", async () => {
  const calls = {};
  mockDispatch("Respuesta genérica del bot.", calls);
  const env = { ANTHROPIC_API_KEY: "sk-test" };
  const conversationId = "conv-encuesta-1";

  let lastReply;
  for (let i = 0; i < 4; i++) {
    lastReply = await handleIncomingMessage(
      buildTestMessage({ conversationId, text: `pregunta número ${i}` }),
      env
    );
  }
  assert.match(lastReply.text, /del 1 al 5/);

  const surveyReply = await handleIncomingMessage(buildTestMessage({ conversationId, text: "5" }), env);
  assert.equal(surveyReply.meta.surveyResponse, 5);
  assert.match(surveyReply.text, /Gracias/);
});

test("handleIncomingMessage (resenas) pide reseña cuando el CSAT es alto y hay REVIEW_URL configurado", async () => {
  const calls = {};
  mockDispatch("Respuesta genérica del bot.", calls);
  const env = { ANTHROPIC_API_KEY: "sk-test", REVIEW_URL: "https://g.page/r/mi-negocio/review" };
  const conversationId = "conv-resena-1";

  for (let i = 0; i < 4; i++) {
    await handleIncomingMessage(buildTestMessage({ conversationId, text: `pregunta número ${i}` }), env);
  }
  const surveyReply = await handleIncomingMessage(buildTestMessage({ conversationId, text: "5" }), env);
  assert.match(surveyReply.text, /g\.page\/r\/mi-negocio\/review/);
});

test("handleIncomingMessage (cobros) genera un link de pago sin pasar por el LLM cuando el cliente pide pagar", async () => {
  const calls = {};
  mockDispatch("Esto NO debería llamarse — cobros debe interceptar antes.", calls);

  const env = {
    ANTHROPIC_API_KEY: "sk-test",
    STRIPE_SECRET_KEY: "sk_test_123",
    DEFAULT_SERVICE_PRICE_USD: "25",
    BUSINESS_DISPLAY_NAME: "CH Veterinarios",
  };
  const msg = buildTestMessage({ conversationId: "conv-cobros-1", text: "quiero pagar la consulta" });

  const reply = await handleIncomingMessage(msg, env);

  assert.equal(calls.stripePrice, 1);
  assert.equal(calls.stripeLink, 1);
  assert.equal(calls.claude, undefined);
  assert.match(reply.text, /buy\.stripe\.com/);
});
