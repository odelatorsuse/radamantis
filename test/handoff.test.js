// test/handoff.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { detectHandoffRequest, escalate } from "../src/superpowers/handoff/index.js";
import { createEmptySession, appendMessage } from "../src/core/session.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

test("detectHandoffRequest detecta pedido explícito de hablar con un humano", () => {
  assert.equal(detectHandoffRequest("quiero hablar con una persona"), true);
  assert.equal(detectHandoffRequest("¿me puedes pasar con un agente?"), true);
  assert.equal(detectHandoffRequest("quiero un representante"), true);
});

test("detectHandoffRequest no marca handoff en un mensaje normal", () => {
  assert.equal(detectHandoffRequest("hola, ¿cuánto cuesta la consulta?"), false);
});

test("detectHandoffRequest maneja texto vacío o nulo sin lanzar", () => {
  assert.equal(detectHandoffRequest(""), false);
  assert.equal(detectHandoffRequest(undefined), false);
});

test("escalate envía un resumen estructurado con historial al WhatsApp admin", async () => {
  let capturedBody;
  globalThis.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, status: 200, text: async () => "" };
  };

  const session = createEmptySession("conv-1", "whatsapp", "5215512345678");
  appendMessage(session, "user", "hola, ¿tienen citas?");
  appendMessage(session, "assistant", "sí, ¿qué día te viene bien?");
  appendMessage(session, "user", "mejor quiero hablar con una persona");

  await escalate(
    { session, messageText: "mejor quiero hablar con una persona" },
    {
      ADMIN_WHATSAPP_NUMBER: "5215500000000",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      WHATSAPP_ACCESS_TOKEN: "token-abc",
      BUSINESS_DISPLAY_NAME: "CH Veterinarios",
    }
  );

  assert.equal(capturedBody.to, "5215500000000");
  assert.match(capturedBody.text.body, /HANDOFF/);
  assert.match(capturedBody.text.body, /CH Veterinarios/);
  assert.match(capturedBody.text.body, /mejor quiero hablar con una persona/);
  assert.match(capturedBody.text.body, /hola, ¿tienen citas\?/);
});

test("escalate no lanza si falta ADMIN_WHATSAPP_NUMBER (solo loguea warning)", async () => {
  const session = createEmptySession("conv-2", "whatsapp", "5215512345678");
  await assert.doesNotReject(() => escalate({ session, messageText: "x" }, {}));
});

test("escalate no lanza si el envío de WhatsApp falla", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => "boom" });
  const session = createEmptySession("conv-3", "whatsapp", "5215512345678");
  await assert.doesNotReject(() =>
    escalate(
      { session, messageText: "x" },
      { ADMIN_WHATSAPP_NUMBER: "521550", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" }
    )
  );
});
