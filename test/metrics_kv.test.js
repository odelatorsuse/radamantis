// test/metrics_kv.test.js
// Store de métricas respaldado en KV, contra un mock mínimo de KVNamespace
// (get/put/list) — no requiere Cloudflare real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KVMetricsStore, InMemoryMetricsStore } from "../src/core/metrics.js";

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
    const keys = [...this._store.keys()]
      .filter((k) => !prefix || k.startsWith(prefix))
      .map((name) => ({ name }));
    // Mock simple: sin paginación real (suficiente para el volumen de estos tests).
    return { keys, list_complete: true, cursor: undefined };
  }
}

test("KVMetricsStore.recordMessage incrementa mensajes, usuarios únicos y costo", async () => {
  const kv = new FakeKV();
  const store = new KVMetricsStore(kv);

  await store.recordMessage({ externalUserId: "user-1", costUsd: 0.001 });
  await store.recordMessage({ externalUserId: "user-1", costUsd: 0.002 }); // mismo usuario, no suma únicos
  await store.recordMessage({ externalUserId: "user-2", costUsd: 0.001 });

  const snap = await store.snapshot();
  assert.equal(snap.messagesToday, 3);
  assert.equal(snap.uniqueUsersToday, 2);
  assert.ok(Math.abs(snap.costUsdThisMonth - 0.004) < 1e-9);
  assert.ok(snap.lastMessageAt.length > 0);
});

test("KVMetricsStore.snapshot trae last7Days con 7 entradas, hoy al final", async () => {
  const kv = new FakeKV();
  const store = new KVMetricsStore(kv);
  await store.recordMessage({ externalUserId: "u1", costUsd: 0 });

  const snap = await store.snapshot();
  assert.equal(snap.last7Days.length, 7);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(snap.last7Days[6].date, today);
  assert.equal(snap.last7Days[6].count, 1);
});

test("KVMetricsStore.recordAppointment y recordHandoff incrementan sus contadores del día", async () => {
  const kv = new FakeKV();
  const store = new KVMetricsStore(kv);
  await store.recordAppointment();
  await store.recordAppointment();
  await store.recordHandoff();

  const snap = await store.snapshot();
  assert.equal(snap.appointmentsToday, 2);
  assert.equal(snap.handoffsToday, 1);
});

test("InMemoryMetricsStore.snapshot también expone last7Days (paridad de interfaz)", async () => {
  const store = new InMemoryMetricsStore();
  await store.recordMessage({ externalUserId: "u1", costUsd: 0.01 });
  const snap = await store.snapshot();
  assert.equal(snap.last7Days.length, 7);
  assert.equal(snap.last7Days.at(-1).count, 1);
});
