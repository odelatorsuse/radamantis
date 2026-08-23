// test/admin_dashboard.test.js
// Cubre el Worker separado "Mis bots" (admin-dashboard/index.js): auth y
// resiliencia del health check (reintento antes de marcar "SIN RESPUESTA").
import { test, after } from "node:test";
import assert from "node:assert/strict";
import worker from "../admin-dashboard/index.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

function basicHeader(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

test("GET / responde 401 sin credenciales cuando hay Basic Auth configurado", async () => {
  const env = { ADMIN_PANEL_USER: "oscar", ADMIN_PANEL_PASSWORD: "secreto123" };
  const res = await worker.fetch(new Request("https://admin.workers.dev/"), env);
  assert.equal(res.status, 401);
});

test("GET / responde 200 sin auth configurada (deja pasar con warning)", async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200 });
  const res = await worker.fetch(new Request("https://admin.workers.dev/"), {});
  assert.equal(res.status, 200);
});

test("GET / lista los negocios de businesses.generated.js con health check en vivo", async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200 });
  const res = await worker.fetch(new Request("https://admin.workers.dev/"), {});
  const text = await res.text();
  assert.match(text, /CH Veterinarios/);
  assert.match(text, /EN LÍNEA/);
});

test("checkHealth reintenta antes de marcar un negocio como SIN RESPUESTA (falla una vez, luego responde)", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) throw new Error("timeout puntual simulado");
    return { ok: true, status: 200 };
  };
  const res = await worker.fetch(new Request("https://admin.workers.dev/"), {});
  const text = await res.text();
  assert.match(text, /EN LÍNEA/);
  assert.ok(calls >= 2, "debería haber reintentado al menos una vez");
});

test("GET /nope responde 404", async () => {
  const res = await worker.fetch(new Request("https://admin.workers.dev/nope"), {});
  assert.equal(res.status, 404);
});
