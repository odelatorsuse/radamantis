// test/worker_routes.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/core/index.js";
import { createMetricsStore } from "../src/core/metrics.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

const TEST_ENV = {
  BUSINESS_SLUG: "test-biz",
  BUSINESS_DISPLAY_NAME: "Negocio de Prueba",
  BUSINESS_VERTICAL: "restaurante",
  ANTHROPIC_API_KEY: "sk-test",
};

test("GET /health responde 200 con el slug del negocio", async () => {
  const res = await worker.fetch(new Request("https://x.workers.dev/health"), TEST_ENV);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.business, "test-biz");
});

test("GET /admin/overview responde 200 con HTML y refleja el nombre del negocio", async () => {
  const res = await worker.fetch(
    new Request("https://x.workers.dev/admin/overview"),
    TEST_ENV
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const text = await res.text();
  assert.match(text, /Negocio de Prueba/);
});

test("GET /conexiones responde 200 con HTML", async () => {
  const res = await worker.fetch(new Request("https://x.workers.dev/conexiones"), TEST_ENV);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /WhatsApp Business API/);
});

test("POST /chat sin body válido responde 400", async () => {
  const res = await worker.fetch(
    new Request("https://x.workers.dev/chat", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    }),
    TEST_ENV
  );
  assert.equal(res.status, 400);
});

test("POST /chat procesa un mensaje de prueba end-to-end y actualiza /admin/overview", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: "claude-3-5-sonnet-20241022",
      content: [{ type: "text", text: "Respuesta de prueba" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 8, output_tokens: 3 },
    }),
  });

  const chatRes = await worker.fetch(
    new Request("https://x.workers.dev/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId: "worker-test-1", text: "hola" }),
      headers: { "content-type": "application/json" },
    }),
    TEST_ENV
  );
  assert.equal(chatRes.status, 200);
  const chatBody = await chatRes.json();
  assert.equal(chatBody.ok, true);
  assert.equal(chatBody.reply.text, "Respuesta de prueba");

  const snapshot = await createMetricsStore(TEST_ENV).snapshot();
  assert.ok(snapshot.messagesToday >= 1);
  assert.ok(snapshot.costUsdThisMonth > 0);

  const overviewRes = await worker.fetch(
    new Request("https://x.workers.dev/admin/overview"),
    TEST_ENV
  );
  assert.equal(overviewRes.status, 200);
});

test("GET /ruta-inexistente responde 404", async () => {
  const res = await worker.fetch(new Request("https://x.workers.dev/nope"), TEST_ENV);
  assert.equal(res.status, 404);
});
