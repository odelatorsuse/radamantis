// test/oido_vista.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { transcribeAudio, describeImage } from "../src/superpowers/oido_vista/index.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

function mockMediaAndOpenAI({ transcript, description }) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("graph.facebook.com")) {
      return { ok: true, status: 200, json: async () => ({ url: "https://cdn.example.com/media/xyz", mime_type: "audio/ogg" }) };
    }
    if (u.includes("cdn.example.com")) {
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) };
    }
    if (u.includes("audio/transcriptions")) {
      return { ok: true, status: 200, json: async () => ({ text: transcript }) };
    }
    if (u.includes("chat/completions")) {
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: description } }] }) };
    }
    throw new Error(`URL inesperada: ${url}`);
  };
}

test("transcribeAudio resuelve el media, lo descarga y devuelve el texto de Whisper", async () => {
  mockMediaAndOpenAI({ transcript: "hola quiero una cita" });
  const text = await transcribeAudio("media-id-1", { WHATSAPP_ACCESS_TOKEN: "tok", OPENAI_API_KEY: "sk-openai" });
  assert.equal(text, "hola quiero una cita");
});

test("transcribeAudio lanza si falta WHATSAPP_ACCESS_TOKEN", async () => {
  await assert.rejects(() => transcribeAudio("media-id-1", { OPENAI_API_KEY: "sk-openai" }), /WHATSAPP_ACCESS_TOKEN/);
});

test("transcribeAudio lanza si falta OPENAI_API_KEY", async () => {
  await assert.rejects(() => transcribeAudio("media-id-1", { WHATSAPP_ACCESS_TOKEN: "tok" }), /OPENAI_API_KEY/);
});

test("transcribeAudio lanza si Whisper responde con error", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("graph.facebook.com")) return { ok: true, status: 200, json: async () => ({ url: "https://cdn.example.com/media/xyz", mime_type: "audio/ogg" }) };
    if (u.includes("cdn.example.com")) return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) };
    return { ok: false, status: 400, json: async () => ({ error: { message: "audio inválido" } }) };
  };
  await assert.rejects(
    () => transcribeAudio("media-id-1", { WHATSAPP_ACCESS_TOKEN: "tok", OPENAI_API_KEY: "sk-openai" }),
    /audio inválido/
  );
});

test("describeImage resuelve el media, lo descarga y devuelve la descripción de la visión", async () => {
  mockMediaAndOpenAI({ description: "Una mascota con la pata lastimada." });
  const text = await describeImage("media-id-2", { WHATSAPP_ACCESS_TOKEN: "tok", OPENAI_API_KEY: "sk-openai" });
  assert.equal(text, "Una mascota con la pata lastimada.");
});

test("describeImage agrega el caption del cliente cuando se pasa", async () => {
  mockMediaAndOpenAI({ description: "Un platillo de pasta." });
  const text = await describeImage("media-id-3", { WHATSAPP_ACCESS_TOKEN: "tok", OPENAI_API_KEY: "sk-openai" }, { caption: "¿tienen esto?" });
  assert.match(text, /Un platillo de pasta\./);
  assert.match(text, /¿tienen esto\?/);
});

test("describeImage lanza si falta OPENAI_API_KEY", async () => {
  await assert.rejects(() => describeImage("media-id-2", { WHATSAPP_ACCESS_TOKEN: "tok" }), /OPENAI_API_KEY/);
});
