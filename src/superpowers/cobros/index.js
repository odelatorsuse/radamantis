// src/superpowers/cobros/index.js
// Superpoder #12: cobros por WhatsApp — genera un link de pago de Stripe al
// vuelo cuando el cliente pide pagar. Requiere env.STRIPE_SECRET_KEY
// (secret) y, para el disparo automático desde el orchestrator,
// env.DEFAULT_SERVICE_PRICE_USD (businesses/<slug>.json -> defaultServicePriceUsd).
//
// Dos llamadas a la API de Stripe (fetch, sin SDK, por compatibilidad con
// Workers): primero se crea un Price con producto inline (evita tener que
// pre-crear un Product en el dashboard de Stripe), luego un Payment Link
// que apunta a ese Price.

const STRIPE_API = "https://api.stripe.com/v1";

const PAYMENT_INTENT_PATTERNS = [
  /\bquiero pagar\b/i,
  /\bc[oó]mo (le )?pago\b/i,
  /\bmandas?(me)?\b.{0,20}\b(link|enlace)\b.{0,15}\bde pago\b/i,
  /\bd[oó]nde pago\b/i,
  /\bpuedo pagar\b/i,
];

/**
 * @param {string} text
 * @returns {boolean}
 */
export function detectPaymentIntent(text) {
  if (!text) return false;
  return PAYMENT_INTENT_PATTERNS.some((p) => p.test(text));
}

async function stripeRequest(path, body, env) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${path} falló (${res.status}): ${data?.error?.message || JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Crea un link de pago de un solo uso por el monto indicado.
 * @param {Object} params
 * @param {number} params.amountUsd
 * @param {string} [params.description]
 * @param {Record<string, any>} env
 * @returns {Promise<{url: string, priceId: string}>}
 */
export async function createPaymentLink({ amountUsd, description }, env) {
  if (!env?.STRIPE_SECRET_KEY) {
    throw new Error("createPaymentLink: falta STRIPE_SECRET_KEY (superpoder de cobros no configurado)");
  }
  if (!(amountUsd > 0)) {
    throw new Error("createPaymentLink: amountUsd debe ser mayor a 0");
  }

  const price = await stripeRequest(
    "/prices",
    {
      currency: "usd",
      unit_amount: String(Math.round(amountUsd * 100)),
      "product_data[name]": description || "Servicio",
    },
    env
  );

  const link = await stripeRequest(
    "/payment_links",
    {
      "line_items[0][price]": price.id,
      "line_items[0][quantity]": "1",
    },
    env
  );

  return { url: link.url, priceId: price.id };
}

export default { detectPaymentIntent, createPaymentLink };
