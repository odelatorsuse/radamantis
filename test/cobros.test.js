// test/cobros.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { detectPaymentIntent, createPaymentLink } from "../src/superpowers/cobros/index.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

test("detectPaymentIntent detecta frases comunes de intención de pago", () => {
  assert.equal(detectPaymentIntent("quiero pagar la consulta"), true);
  assert.equal(detectPaymentIntent("¿cómo le pago?"), true);
  assert.equal(detectPaymentIntent("¿me mandas el link de pago?"), true);
  assert.equal(detectPaymentIntent("¿dónde pago?"), true);
});

test("detectPaymentIntent no dispara en un mensaje normal", () => {
  assert.equal(detectPaymentIntent("hola, ¿tienen citas mañana?"), false);
  assert.equal(detectPaymentIntent(""), false);
  assert.equal(detectPaymentIntent(undefined), false);
});

test("createPaymentLink crea un Price y un Payment Link encadenados", async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (String(url).endsWith("/v1/prices")) {
      const body = new URLSearchParams(opts.body);
      assert.equal(body.get("unit_amount"), "2500");
      assert.equal(body.get("currency"), "usd");
      return { ok: true, status: 200, json: async () => ({ id: "price_abc" }) };
    }
    if (String(url).endsWith("/v1/payment_links")) {
      const body = new URLSearchParams(opts.body);
      assert.equal(body.get("line_items[0][price]"), "price_abc");
      return { ok: true, status: 200, json: async () => ({ url: "https://buy.stripe.com/test_xyz" }) };
    }
    throw new Error(`URL inesperada en el test: ${url}`);
  };

  const result = await createPaymentLink({ amountUsd: 25, description: "Consulta" }, { STRIPE_SECRET_KEY: "sk_test_123" });
  assert.equal(result.url, "https://buy.stripe.com/test_xyz");
  assert.equal(result.priceId, "price_abc");
  assert.equal(calls.length, 2);
});

test("createPaymentLink lanza si falta STRIPE_SECRET_KEY", async () => {
  await assert.rejects(() => createPaymentLink({ amountUsd: 10 }, {}), /STRIPE_SECRET_KEY/);
});

test("createPaymentLink lanza si el monto no es válido", async () => {
  await assert.rejects(
    () => createPaymentLink({ amountUsd: 0 }, { STRIPE_SECRET_KEY: "sk_test_123" }),
    /amountUsd/
  );
});

test("createPaymentLink propaga el error de Stripe si la API responde con error", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: { message: "monto inválido" } }),
  });
  await assert.rejects(
    () => createPaymentLink({ amountUsd: 25 }, { STRIPE_SECRET_KEY: "sk_test_123" }),
    /monto inválido/
  );
});
