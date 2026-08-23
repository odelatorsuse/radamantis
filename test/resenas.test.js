// test/resenas.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRequestReview, buildReviewRequestMessage } from "../src/superpowers/resenas/index.js";
import { createEmptySession } from "../src/core/session.js";

function baseSession() {
  return createEmptySession("conv-1", "whatsapp", "521555");
}

test("shouldRequestReview es false sin REVIEW_URL configurado", () => {
  const s = baseSession();
  s.state.surveyResponse = 5;
  assert.equal(shouldRequestReview(s, {}), false);
});

test("shouldRequestReview es false con CSAT bajo", () => {
  const s = baseSession();
  s.state.surveyResponse = 3;
  assert.equal(shouldRequestReview(s, { REVIEW_URL: "https://g.page/r/x" }), false);
});

test("shouldRequestReview es true con CSAT alto y REVIEW_URL configurado", () => {
  const s = baseSession();
  s.state.surveyResponse = 5;
  assert.equal(shouldRequestReview(s, { REVIEW_URL: "https://g.page/r/x" }), true);
});

test("shouldRequestReview es false si ya se pidió antes", () => {
  const s = baseSession();
  s.state.surveyResponse = 5;
  s.state.reviewRequestedAt = Date.now();
  assert.equal(shouldRequestReview(s, { REVIEW_URL: "https://g.page/r/x" }), false);
});

test("buildReviewRequestMessage incluye el REVIEW_URL del negocio", () => {
  const msg = buildReviewRequestMessage({ REVIEW_URL: "https://g.page/r/mi-negocio" });
  assert.match(msg, /https:\/\/g\.page\/r\/mi-negocio/);
});
