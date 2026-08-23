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

test("GET /admin/overview responde 401 sin credenciales cuando el negocio configuró Basic Auth", async () => {
  const secureEnv = { ...TEST_ENV, ADMIN_PANEL_USER: "oscar", ADMIN_PANEL_PASSWORD: "secreto123" };
  const res = await worker.fetch(new Request("https://x.workers.dev/admin/overview"), secureEnv);
  assert.equal(res.status, 401);
});

test("GET /conexiones responde 200 con Basic Auth correcto", async () => {
  const secureEnv = { ...TEST_ENV, ADMIN_PANEL_USER: "oscar", ADMIN_PANEL_PASSWORD: "secreto123" };
  const header = `Basic ${Buffer.from("oscar:secreto123", "utf8").toString("base64")}`;
  const res = await worker.fetch(
    new Request("https://x.workers.dev/conexiones", { headers: { authorization: header } }),
    secureEnv
  );
  assert.equal(res.status, 200);
});

test("scheduled() con el cron horario corre cazador + reactivación, no el reporte diario", async () => {
  let whatsappCalls = 0;
  globalThis.fetch = async () => {
    whatsappCalls++;
    return { ok: true, status: 200, text: async () => "" };
  };
  // Sin SESSIONS (KV) configurado, los sweeps devuelven {checked:0,...} de
  // inmediato (ver session.js listAll) — lo que importa acá es que NO se
  // dispare el reporte diario (que sí mandaría un WhatsApp con este env).
  const env = { ...TEST_ENV, ADMIN_WHATSAPP_NUMBER: "5215500000000", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" };
  await worker.scheduled({ cron: "0 * * * *" }, env, {});
  assert.equal(whatsappCalls, 0);
});

test("scheduled() con el cron diario manda el reporte por WhatsApp", async () => {
  let capturedBody;
  globalThis.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200, text: async () => "" };
  };
  const env = { ...TEST_ENV, ADMIN_WHATSAPP_NUMBER: "5215500000000", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" };
  await worker.scheduled({ cron: "0 14 * * *" }, env, {});
  assert.match(capturedBody.text.body, /REPORTE DIARIO/);
});

test("scheduled() no lanza si algo falla adentro (loguea y sigue)", async () => {
  globalThis.fetch = async () => {
    throw new Error("fallo de red simulado");
  };
  const env = { ...TEST_ENV, ADMIN_WHATSAPP_NUMBER: "5215500000000", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" };
  await assert.doesNotReject(() => worker.scheduled({ cron: "0 14 * * *" }, env, {}));
});
