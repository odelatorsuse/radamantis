// test/multiidioma.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage, buildLanguageHint } from "../src/superpowers/multiidioma/index.js";

test("detectLanguage identifica español por señales fuertes (ñ, ¿, ¡)", () => {
  assert.equal(detectLanguage("¿Cuánto cuesta la consulta?"), "es");
  assert.equal(detectLanguage("Mañana no puedo, ¡qué pena!"), "es");
});

test("detectLanguage identifica inglés por palabras clave", () => {
  assert.equal(detectLanguage("hello, do you have an appointment tomorrow please"), "en");
});

test("detectLanguage identifica portugués por señales fuertes y palabras clave", () => {
  assert.equal(detectLanguage("Não sei quanto custa, obrigado"), "pt");
  assert.equal(detectLanguage("quero saber quanto custa por favor"), "pt");
});

test("detectLanguage devuelve español por defecto con texto muy corto o ambiguo", () => {
  assert.equal(detectLanguage("ok"), "es");
  assert.equal(detectLanguage(""), "es");
  assert.equal(detectLanguage(undefined), "es");
  assert.equal(detectLanguage("123 456"), "es");
});

test("buildLanguageHint no agrega nada para español (ya cubierto por el prompt base)", () => {
  assert.equal(buildLanguageHint("es"), "");
  assert.equal(buildLanguageHint(undefined), "");
});

test("buildLanguageHint nombra el idioma detectado para inglés/portugués", () => {
  assert.match(buildLanguageHint("en"), /inglés/);
  assert.match(buildLanguageHint("pt"), /portugués/);
});
