// test/reactivacion.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { isColdLeadCandidate, buildReactivationMessage, sweepColdLeads } from "../src/superpowers/reactivacion/index.js";
import { createEmptySession, appendMessage } from "../src/core/session.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

class FakeKV {
  constructor() {
    this._store = new Map();
  }
  async get(key) {
    return this._store.has(key) ? this._store.get(key) : null;
  }
  async put(key, value) {
    this._store.set(key, value);
  }
  async list({ prefix } = {}) {
    const keys = [...this._store.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((name) => ({ name }));
    return { keys, list_complete: true, cursor: undefined };
  }
}

function coldSession({ conversationId = "conv-1", channel = "whatsapp", daysAgo = 5, state = {} } = {}) {
  const session = createEmptySession(conversationId, channel, "521555");
  appendMessage(session, "user", "hola, quería preguntar algo");
  session.updatedAt = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  session.state = state;
  return session;
}

test("isColdLeadCandidate es true entre 3 y 14 días de silencio", () => {
  assert.equal(isColdLeadCandidate(coldSession({ daysAgo: 5 })), true);
});

test("isColdLeadCandidate es false fuera de la ventana", () => {
  assert.equal(isColdLeadCandidate(coldSession({ daysAgo: 1 })), false);
  assert.equal(isColdLeadCandidate(coldSession({ daysAgo: 20 })), false);
});

test("isColdLeadCandidate es false si no es WhatsApp, ya se reactivó, o hubo handoff", () => {
  assert.equal(isColdLeadCandidate(coldSession({ daysAgo: 5, channel: "test" })), false);
  assert.equal(isColdLeadCandidate(coldSession({ daysAgo: 5, state: { reactivatedAt: Date.now() } })), false);
  assert.equal(isColdLeadCandidate(coldSession({ daysAgo: 5, state: { handoffRequestedAt: Date.now() } })), false);
});

test("buildReactivationMessage nombra el negocio", () => {
  assert.match(buildReactivationMessage({ BUSINESS_DISPLAY_NAME: "Panadería Sol" }), /Panadería Sol/);
});

test("sweepColdLeads reactiva solo las sesiones frías y marca reactivatedAt", async () => {
  let whatsappCalls = 0;
  globalThis.fetch = async () => {
    whatsappCalls++;
    return { ok: true, status: 200, text: async () => "" };
  };

  const kv = new FakeKV();
  await kv.put("session:cold", JSON.stringify(coldSession({ conversationId: "cold", daysAgo: 5 })));
  await kv.put("session:fresh", JSON.stringify(coldSession({ conversationId: "fresh", daysAgo: 1 })));

  const env = { SESSIONS: kv, WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" };
  const result = await sweepColdLeads(env);

  assert.equal(result.checked, 2);
  assert.equal(result.reactivated, 1);
  assert.equal(whatsappCalls, 1);

  const stored = JSON.parse(await kv.get("session:cold"));
  assert.ok(stored.state.reactivatedAt);
});
