// test/vigilante.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { detectRisk, alertAdmin } from "../src/superpowers/vigilante/index.js";
import { createEmptySession } from "../src/core/session.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

test("detectRisk detecta patrones de alto riesgo", () => {
  const r = detectRisk("esto es una emergencia, mi perro se está muriendo");
  assert.equal(r.risk, true);
  assert.equal(r.severity, "high");
});

test("detectRisk detecta frustración de severidad media", () => {
  const r = detectRisk("estoy harto, nadie me responde");
  assert.equal(r.risk, true);
  assert.equal(r.severity, "medium");
});

test("detectRisk detecta gritos (mayúsculas sostenidas) como riesgo bajo/medio", () => {
  const r = detectRisk("NECESITO QUE ME AYUDEN AHORA");
  assert.equal(r.risk, true);
});

test("detectRisk no marca riesgo en un mensaje normal", () => {
  const r = detectRisk("hola, ¿tienen citas mañana?");
  assert.equal(r.risk, false);
  assert.equal(r.severity, "low");
});

test("detectRisk maneja texto vacío o nulo sin lanzar", () => {
  assert.deepEqual(detectRisk(""), { risk: false, severity: "low", reason: null });
  assert.deepEqual(detectRisk(undefined), { risk: false, severity: "low", reason: null });
});

test("alertAdmin envía un mensaje de WhatsApp formateado al admin", async () => {
  let capturedBody;
  globalThis.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200, text: async () => "" };
  };

  const session = createEmptySession("conv-1", "whatsapp", "5215512345678");
  const risk = { risk: true, severity: "high", reason: "coincide con patrón de alto riesgo" };

  await alertAdmin(
    { session, messageText: "quiero un reembolso ya", risk },
    {
      ADMIN_WHATSAPP_NUMBER: "5215500000000",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      WHATSAPP_ACCESS_TOKEN: "token-abc",
      BUSINESS_DISPLAY_NAME: "CH Veterinarios",
    }
  );

  assert.equal(capturedBody.to, "5215500000000");
  assert.match(capturedBody.text.body, /VIGILANTE/);
  assert.match(capturedBody.text.body, /CH Veterinarios/);
  assert.match(capturedBody.text.body, /HIGH/);
  assert.match(capturedBody.text.body, /quiero un reembolso ya/);
});

test("alertAdmin no lanza si falta ADMIN_WHATSAPP_NUMBER (solo loguea warning)", async () => {
  const session = createEmptySession("conv-2", "whatsapp", "5215512345678");
  const risk = { risk: true, severity: "medium", reason: "x" };
  await assert.doesNotReject(() => alertAdmin({ session, messageText: "x", risk }, {}));
});

test("alertAdmin no lanza si el envío de WhatsApp falla", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => "boom" });
  const session = createEmptySession("conv-3", "whatsapp", "5215512345678");
  const risk = { risk: true, severity: "high", reason: "x" };
  await assert.doesNotReject(() =>
    alertAdmin(
      { session, messageText: "x", risk },
      { ADMIN_WHATSAPP_NUMBER: "521550", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" }
    )
  );
});
