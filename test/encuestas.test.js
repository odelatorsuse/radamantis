// test/encuestas.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldSendSurvey, buildSurveyMessage, isAwaitingSurveyReply, parseCsatResponse } from "../src/superpowers/encuestas/index.js";
import { createEmptySession, appendMessage } from "../src/core/session.js";

function sessionWithUserTurns(n) {
  const session = createEmptySession(`conv-${n}`, "whatsapp", "521555");
  for (let i = 0; i < n; i++) {
    appendMessage(session, "user", `mensaje ${i}`);
    appendMessage(session, "assistant", `respuesta ${i}`);
  }
  return session;
}

test("shouldSendSurvey es false antes del mínimo de turnos", () => {
  assert.equal(shouldSendSurvey(sessionWithUserTurns(2)), false);
});

test("shouldSendSurvey es true al llegar al mínimo de turnos", () => {
  assert.equal(shouldSendSurvey(sessionWithUserTurns(4)), true);
});

test("shouldSendSurvey es false si ya se envió o ya se respondió", () => {
  const s1 = sessionWithUserTurns(5);
  s1.state.surveySentAt = Date.now();
  assert.equal(shouldSendSurvey(s1), false);

  const s2 = sessionWithUserTurns(5);
  s2.state.surveyResponse = 4;
  assert.equal(shouldSendSurvey(s2), false);
});

test("shouldSendSurvey es false si la sesión ya pidió un humano (handoff)", () => {
  const s = sessionWithUserTurns(5);
  s.state.handoffRequestedAt = Date.now();
  assert.equal(shouldSendSurvey(s), false);
});

test("buildSurveyMessage pide una calificación 1-5", () => {
  assert.match(buildSurveyMessage(), /1 al 5/);
});

test("isAwaitingSurveyReply refleja el estado de la sesión", () => {
  const s = createEmptySession("conv-x", "whatsapp", "521555");
  assert.equal(isAwaitingSurveyReply(s), false);
  s.state.surveySentAt = Date.now();
  assert.equal(isAwaitingSurveyReply(s), true);
  s.state.surveyResponse = 5;
  assert.equal(isAwaitingSurveyReply(s), false);
});

test("parseCsatResponse extrae un número 1-5 de distintos formatos", () => {
  assert.equal(parseCsatResponse("5"), 5);
  assert.equal(parseCsatResponse("le doy un 4"), 4);
  assert.equal(parseCsatResponse("3/5"), 3);
});

test("parseCsatResponse devuelve null si no hay número interpretable", () => {
  assert.equal(parseCsatResponse("muy bien gracias"), null);
  assert.equal(parseCsatResponse(""), null);
  assert.equal(parseCsatResponse(undefined), null);
  assert.equal(parseCsatResponse("tengo 10 años esperando"), null); // fuera de rango 1-5
});
