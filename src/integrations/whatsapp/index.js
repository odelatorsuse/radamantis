// src/integrations/whatsapp/index.js
// Integración con WhatsApp Business API (Meta Cloud API).
// Contrato esperado por src/core/router.js:
//   - verifyWebhookChallenge(url, env) -> string | null   (handshake GET)
//   - verifyWebhook(request, rawBody, env) -> boolean      (firma POST)
//   - parseIncoming(rawBody, headers, env) -> NormalizedMessage[]
//   - sendMessage(outgoing, env) -> Promise<void>
//
// Variables de entorno requeridas (ver .env.example / businesses/*.json):
//   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN,
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN, WHATSAPP_APP_SECRET

const GRAPH_API_VERSION = "v20.0";

/**
 * Handshake de verificación del webhook (Meta llama GET una sola vez al
 * configurar la URL en el dashboard de Meta for Developers).
 * @param {URL} url
 * @param {Record<string,string>} env
 * @returns {string | null} el "hub.challenge" a devolver, o null si no es válido
 */
export function verifyWebhookChallenge(url, env) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && env?.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verifica la firma HMAC-SHA256 del header X-Hub-Signature-256 contra el
 * body crudo, usando WHATSAPP_APP_SECRET. Previene que cualquiera pueda
 * pegarle a /webhook/whatsapp haciéndose pasar por Meta.
 * @param {Request} request
 * @param {string} rawBody
 * @param {Record<string,string>} env
 * @returns {Promise<boolean>}
 */
export async function verifyWebhook(request, rawBody, env) {
  const secret = env?.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.warn("[whatsapp] WHATSAPP_APP_SECRET no configurado — se acepta el webhook SIN verificar firma (inseguro).");
    return true;
  }

  const signatureHeader = request.headers.get("x-hub-signature-256") || "";
  const [scheme, providedHex] = signatureHeader.split("=");
  if (scheme !== "sha256" || !providedHex) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expectedHex = bytesToHex(new Uint8Array(signatureBuf));

  // Comparación en tiempo constante para evitar timing attacks.
  const a = hexToBytes(expectedHex);
  const b = hexToBytes(providedHex.length === expectedHex.length ? providedHex : expectedHex.replace(/./g, "0"));
  if (providedHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Convierte el payload nativo de Meta a NormalizedMessage[].
 * Estructura real de Meta: { entry: [{ changes: [{ value: { messages, contacts, metadata } }] }] }
 * Ignora silenciosamente eventos que no son mensajes entrantes (ej. status
 * updates de "delivered"/"read").
 * @param {string} rawBody
 * @param {Headers} _headers
 * @param {Record<string,string>} _env
 * @returns {Promise<import("../../core/types.js").NormalizedMessage[]>}
 */
export async function parseIncoming(rawBody, _headers, _env) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return [];
  }

  /** @type {import("../../core/types.js").NormalizedMessage[]} */
  const out = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const msg of value.messages || []) {
        const base = {
          channel: "whatsapp",
          externalUserId: msg.from,
          conversationId: `whatsapp:${msg.from}`,
          timestamp: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
          raw: msg,
        };

        if (msg.type === "text") {
          out.push({ ...base, contentType: "text", text: msg.text?.body || "" });
        } else if (msg.type === "audio") {
          out.push({ ...base, contentType: "audio", mediaUrl: msg.audio?.id });
        } else if (msg.type === "image") {
          out.push({ ...base, contentType: "image", mediaUrl: msg.image?.id, text: msg.image?.caption });
        } else if (msg.type === "location") {
          out.push({ ...base, contentType: "location", text: JSON.stringify(msg.location) });
        }
        // Otros tipos (sticker, contacts, reaction, etc.) se ignoran por ahora.
      }
    }
  }

  return out;
}

/**
 * Envía un mensaje de texto vía WhatsApp Cloud API.
 * @param {import("../../core/types.js").OutgoingMessage} outgoing
 * @param {Record<string,string>} env
 * @returns {Promise<void>}
 */
export async function sendMessage(outgoing, env) {
  const phoneNumberId = env?.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = env?.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error("sendMessage(whatsapp): faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN");
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: outgoing.externalUserId,
      type: "text",
      text: { body: outgoing.text },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`WhatsApp sendMessage falló (${res.status}): ${errText}`);
  }
}

export default { verifyWebhookChallenge, verifyWebhook, parseIncoming, sendMessage };
