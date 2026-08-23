// test/cazador.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { isHotFollowUpCandidate, buildFollowUpMessage, sweepHotLeads } from "../src/superpowers/cazador/index.js";
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
  async list({ prefix, cursor } = {}) {
    const keys = [...this._store.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((name) => ({ name }));
    return { keys, list_complete: true, cursor: undefined };
  }
}

function hotSession({ conversationId = "conv-1", channel = "whatsapp", hoursAgo = 5, lastRole = "assistant", state = {} } = {}) {
  const session = createEmptySession(conversationId, channel, "521555");
  appendMessage(session, "user", "quiero información de precios");
  if (lastRole === "assistant") appendMessage(session, "assistant", "Claro, te comparto los precios...");
  session.updatedAt = Date.now() - hoursAgo * 60 * 60 * 1000;
  session.state = state;
  return session;
}

test("isHotFollowUpCandidate es true en la ventana de 3-20h con el bot esperando respuesta", () => {
  assert.equal(isHotFollowUpCandidate(hotSession({ hoursAgo: 5 })), true);
});

test("isHotFollowUpCandidate es false fuera de la ventana (muy reciente o muy viejo)", () => {
  assert.equal(isHotFollowUpCandidate(hotSession({ hoursAgo: 1 })), false);
  assert.equal(isHotFollowUpCandidate(hotSession({ hoursAgo: 25 })), false);
});

test("isHotFollowUpCandidate es false si el último turno fue del cliente (está esperando respuesta del bot, no al revés)", () => {
  assert.equal(isHotFollowUpCandidate(hotSession({ hoursAgo: 5, lastRole: "user" })), false);
});

test("isHotFollowUpCandidate es false si no es WhatsApp o ya se le hizo follow-up/handoff", () => {
  assert.equal(isHotFollowUpCandidate(hotSession({ hoursAgo: 5, channel: "test" })), false);
  assert.equal(isHotFollowUpCandidate(hotSession({ hoursAgo: 5, state: { followedUpAt: Date.now() } })), false);
  assert.equal(isHotFollowUpCandidate(hotSession({ hoursAgo: 5, state: { handoffRequestedAt: Date.now() } })), false);
});

test("buildFollowUpMessage referencia el último mensaje del cliente", () => {
  const session = hotSession({ hoursAgo: 5 });
  const msg = buildFollowUpMessage(session, { BUSINESS_DISPLAY_NAME: "CH Veterinarios" });
  assert.match(msg, /quiero información de precios/);
  assert.match(msg, /CH Veterinarios/);
});

test("sweepHotLeads manda follow-up solo a las sesiones candidatas y marca followedUpAt", async () => {
  let whatsappCalls = 0;
  globalThis.fetch = async () => {
    whatsappCalls++;
    return { ok: true, status: 200, text: async () => "" };
  };

  const kv = new FakeKV();
  await kv.put("session:hot", JSON.stringify(hotSession({ conversationId: "hot", hoursAgo: 5 })));
  await kv.put("session:cold-recent", JSON.stringify(hotSession({ conversationId: "cold-recent", hoursAgo: 1 })));

  const env = { SESSIONS: kv, WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" };
  const result = await sweepHotLeads(env);

  assert.equal(result.checked, 2);
  assert.equal(result.followedUp, 1);
  assert.equal(whatsappCalls, 1);

  const stored = JSON.parse(await kv.get("session:hot"));
  assert.ok(stored.state.followedUpAt);
});

test("sweepHotLeads no lanza si un envío individual falla, y sigue con el resto", async () => {
  globalThis.fetch = async () => {
    throw new Error("fallo de red simulado");
  };
  const kv = new FakeKV();
  await kv.put("session:hot", JSON.stringify(hotSession({ hoursAgo: 5 })));
  const env = { SESSIONS: kv, WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" };

  const result = await sweepHotLeads(env);
  assert.equal(result.checked, 1);
  assert.equal(result.followedUp, 0);
});
