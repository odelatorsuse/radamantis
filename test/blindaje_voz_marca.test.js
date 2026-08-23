// test/blindaje_voz_marca.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGroundingInstruction } from "../src/superpowers/blindaje/index.js";
import { buildBrandVoiceInstruction } from "../src/superpowers/voz_marca/index.js";

test("buildGroundingInstruction pide no inventar datos inciertos", () => {
  const text = buildGroundingInstruction();
  assert.match(text, /NO inventes/);
  assert.match(text, /confirmarlo/);
});

test("buildBrandVoiceInstruction incluye el nombre del negocio y el systemPromptExtra", () => {
  const text = buildBrandVoiceInstruction({
    BUSINESS_DISPLAY_NAME: "CH Veterinarios",
    VOICE_TONE: "calido",
    SYSTEM_PROMPT_EXTRA: "Ayuda a agendar citas.",
  });
  assert.match(text, /CH Veterinarios/);
  assert.match(text, /cálido/);
  assert.match(text, /Ayuda a agendar citas\./);
});

test("buildBrandVoiceInstruction usa un fallback razonable sin config", () => {
  const text = buildBrandVoiceInstruction({});
  assert.match(text, /la marca/);
});

test("buildBrandVoiceInstruction no revienta con un VOICE_TONE desconocido", () => {
  assert.doesNotThrow(() => buildBrandVoiceInstruction({ VOICE_TONE: "algo-que-no-existe" }));
});
