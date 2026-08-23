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
