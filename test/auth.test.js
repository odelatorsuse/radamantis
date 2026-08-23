// test/auth.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireBasicAuth } from "../src/core/auth.js";

function basicHeader(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

test("requireBasicAuth deja pasar (con warning) si el negocio no configuró credenciales", () => {
  const request = new Request("https://x.workers.dev/admin/overview");
  const result = requireBasicAuth(request, {});
  assert.equal(result, null);
});

test("requireBasicAuth responde 401 si faltan credenciales configuradas y no se manda header", () => {
  const request = new Request("https://x.workers.dev/admin/overview");
  const result = requireBasicAuth(request, { ADMIN_PANEL_USER: "oscar", ADMIN_PANEL_PASSWORD: "secreto123" });
  assert.ok(result instanceof Response);
  assert.equal(result.status, 401);
  assert.match(result.headers.get("www-authenticate"), /Basic/);
});

test("requireBasicAuth responde 401 con credenciales incorrectas", () => {
  const request = new Request("https://x.workers.dev/admin/overview", {
    headers: { authorization: basicHeader("oscar", "incorrecta") },
  });
  const result = requireBasicAuth(request, { ADMIN_PANEL_USER: "oscar", ADMIN_PANEL_PASSWORD: "secreto123" });
  assert.equal(result.status, 401);
});

test("requireBasicAuth deja pasar con credenciales correctas", () => {
  const request = new Request("https://x.workers.dev/admin/overview", {
    headers: { authorization: basicHeader("oscar", "secreto123") },
  });
  const result = requireBasicAuth(request, { ADMIN_PANEL_USER: "oscar", ADMIN_PANEL_PASSWORD: "secreto123" });
  assert.equal(result, null);
});

test("requireBasicAuth responde 401 con esquema de auth distinto de Basic", () => {
  const request = new Request("https://x.workers.dev/admin/overview", {
    headers: { authorization: "Bearer algun-token" },
  });
  const result = requireBasicAuth(request, { ADMIN_PANEL_USER: "oscar", ADMIN_PANEL_PASSWORD: "secreto123" });
  assert.equal(result.status, 401);
});

test("requireBasicAuth no revienta con un realm que trae caracteres no-ASCII (em-dash, acentos)", () => {
  const request = new Request("https://x.workers.dev/");
  const result = requireBasicAuth(request, { ADMIN_PANEL_USER: "u", ADMIN_PANEL_PASSWORD: "p" }, "Radamantis — Mis bots · CH Veterinarios");
  assert.equal(result.status, 401);
  assert.doesNotThrow(() => result.headers.get("www-authenticate"));
});

test("requireBasicAuth responde 401 con base64 malformado", () => {
  const request = new Request("https://x.workers.dev/admin/overview", {
    headers: { authorization: "Basic %%%no-es-base64%%%" },
  });
  const result = requireBasicAuth(request, { ADMIN_PANEL_USER: "oscar", ADMIN_PANEL_PASSWORD: "secreto123" });
  assert.equal(result.status, 401);
});
