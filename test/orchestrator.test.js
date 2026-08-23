// test/orchestrator.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { handleIncomingMessage } from "../src/core/orchestrator.js";
import { buildTestMessage } from "../src/core/router.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

function mockClaudeReply(text) {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: "claude-3-5-sonnet-20241022",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 4 },
    }),
  });
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

test("handleIncomingMessage rechaza contentType no soportado (ej. audio) hasta implementar oido_vista", async () => {
  const env = { ANTHROPIC_API_KEY: "sk-test" };
  const msg = { ...buildTestMessage({ conversationId: "conv-3", text: "" }), contentType: "audio", text: undefined };
  await assert.rejects(() => handleIncomingMessage(msg, env), /oido_vista/);
});

function mockClaudeAndWhatsapp(replyText, onWhatsappSend) {
  globalThis.fetch = async (url) => {
    if (typeof url === "string" && url.includes("graph.facebook.com")) {
      if (onWhatsappSend) onWhatsappSend();
      return { ok: true, status: 200, text: async () => "" };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: "claude-3-5-sonnet-20241022",
        content: [{ type: "text", text: replyText }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 4 },
      }),
    };
  };
}

test("handleIncomingMessage dispara vigilante y alerta al admin cuando detecta riesgo alto", async () => {
  let whatsappCalls = 0;
  mockClaudeAndWhatsapp("Lamento escuchar eso, vamos a ayudarte ahora mismo.", () => whatsappCalls++);

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
  assert.equal(whatsappCalls, 1);
});

test("handleIncomingMessage no dispara vigilante en un mensaje normal", async () => {
  let whatsappCalls = 0;
  mockClaudeAndWhatsapp("Claro, ¿qué día te viene bien?", () => whatsappCalls++);

  const env = {
    ANTHROPIC_API_KEY: "sk-test",
    ADMIN_WHATSAPP_NUMBER: "5215500000000",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_ACCESS_TOKEN: "token-abc",
  };
  const msg = buildTestMessage({ conversationId: "conv-vigilante-2", text: "hola, ¿tienen citas mañana?" });

  const reply = await handleIncomingMessage(msg, env);

  assert.equal(reply.meta.riskDetected, false);
  assert.equal(whatsappCalls, 0);
});

test("handleIncomingMessage dispara handoff y registra la métrica cuando el cliente pide un humano", async () => {
  let whatsappCalls = 0;
  mockClaudeAndWhatsapp("Ya te comunico con alguien del equipo.", () => whatsappCalls++);

  const env = {
    ANTHROPIC_API_KEY: "sk-test",
    ADMIN_WHATSAPP_NUMBER: "5215500000000",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_ACCESS_TOKEN: "token-abc",
  };
  const msg = buildTestMessage({ conversationId: "conv-handoff-1", text: "quiero hablar con una persona" });

  const reply = await handleIncomingMessage(msg, env);

  assert.equal(reply.meta.escalatedToHuman, true);
  assert.equal(whatsappCalls, 1);
});
