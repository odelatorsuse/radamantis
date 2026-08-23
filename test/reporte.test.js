// test/reporte.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { buildDailyReportText, sendDailyReport } from "../src/superpowers/reporte/index.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

const SNAPSHOT = {
  messagesToday: 12,
  uniqueUsersToday: 5,
  costUsdThisMonth: 1.234,
  appointmentsToday: 2,
  handoffsToday: 1,
  lastMessageAt: new Date().toISOString(),
  last7Days: [],
  csatAverage: 4.5,
  csatCount: 2,
};

test("buildDailyReportText incluye las métricas clave y el % resuelto sin humano", () => {
  const text = buildDailyReportText(SNAPSHOT, { BUSINESS_DISPLAY_NAME: "CH Veterinarios" });
  assert.match(text, /CH Veterinarios/);
  assert.match(text, /Mensajes hoy: 12/);
  assert.match(text, /Clientes únicos: 5/);
  assert.match(text, /Handoffs a humano: 1/);
  assert.match(text, /92%/); // (1 - 1/12) redondeado
  assert.match(text, /\$1\.23/);
});

test("buildDailyReportText no revienta con 0 mensajes (evita división por cero)", () => {
  const text = buildDailyReportText({ ...SNAPSHOT, messagesToday: 0, handoffsToday: 0 }, {});
  assert.match(text, /100%/);
});

test("sendDailyReport manda el reporte al WhatsApp del admin", async () => {
  let capturedBody;
  globalThis.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200, text: async () => "" };
  };

  await sendDailyReport(SNAPSHOT, {
    ADMIN_WHATSAPP_NUMBER: "5215500000000",
    WHATSAPP_PHONE_NUMBER_ID: "1",
    WHATSAPP_ACCESS_TOKEN: "t",
    BUSINESS_DISPLAY_NAME: "CH Veterinarios",
  });

  assert.equal(capturedBody.to, "5215500000000");
  assert.match(capturedBody.text.body, /REPORTE DIARIO/);
});

test("sendDailyReport no lanza si falta ADMIN_WHATSAPP_NUMBER", async () => {
  await assert.doesNotReject(() => sendDailyReport(SNAPSHOT, {}));
});
