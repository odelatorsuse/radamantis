// test/whatsapp_integration.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  verifyWebhookChallenge,
  verifyWebhook,
  parseIncoming,
  sendMessage,
} from "../src/integrations/whatsapp/index.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

test("verifyWebhookChallenge acepta el handshake con el token correcto", () => {
  const url = new URL(
    "https://x.workers.dev/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=abc123&hub.challenge=ping-42"
  );
  const result = verifyWebhookChallenge(url, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: "abc123" });
  assert.equal(result, "ping-42");
});

test("verifyWebhookChallenge rechaza un token incorrecto", () => {
  const url = new URL(
    "https://x.workers.dev/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=ping-42"
  );
  const result = verifyWebhookChallenge(url, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: "abc123" });
  assert.equal(result, null);
});

test("verifyWebhook acepta una firma HMAC-SHA256 válida", async () => {
  const secret = "test-app-secret";
  const rawBody = JSON.stringify({ entry: [] });
  const expectedHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const request = new Request("https://x.workers.dev/webhook/whatsapp", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${expectedHex}` },
  });

  const valid = await verifyWebhook(request, rawBody, { WHATSAPP_APP_SECRET: secret });
  assert.equal(valid, true);
});

test("verifyWebhook rechaza una firma inválida", async () => {
  const request = new Request("https://x.workers.dev/webhook/whatsapp", {
    method: "POST",
    headers: { "x-hub-signature-256": "sha256=deadbeef" },
  });
  const valid = await verifyWebhook(request, "{}", { WHATSAPP_APP_SECRET: "test-app-secret" });
  assert.equal(valid, false);
});

test("verifyWebhook acepta sin verificar si no hay APP_SECRET configurado (con warning)", async () => {
  const request = new Request("https://x.workers.dev/webhook/whatsapp", { method: "POST" });
  const valid = await verifyWebhook(request, "{}", {});
  assert.equal(valid, true);
});

test("parseIncoming convierte un payload real de Meta a NormalizedMessage[]", async () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "1234567890" },
              contacts: [{ profile: { name: "Juan" }, wa_id: "5215512345678" }],
              messages: [
                {
                  from: "5215512345678",
                  id: "wamid.ABC123",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "hola, tienen citas mañana?" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const messages = await parseIncoming(JSON.stringify(payload), new Headers(), {});
  assert.equal(messages.length, 1);
  assert.equal(messages[0].channel, "whatsapp");
  assert.equal(messages[0].externalUserId, "5215512345678");
  assert.equal(messages[0].conversationId, "whatsapp:5215512345678");
  assert.equal(messages[0].contentType, "text");
  assert.equal(messages[0].text, "hola, tienen citas mañana?");
  assert.equal(messages[0].timestamp, 1700000000000);
});

test("parseIncoming ignora eventos de status (delivered/read) sin messages", async () => {
  const payload = {
    entry: [{ changes: [{ value: { statuses: [{ status: "delivered" }] } }] }],
  };
  const messages = await parseIncoming(JSON.stringify(payload), new Headers(), {});
  assert.equal(messages.length, 0);
});

test("parseIncoming devuelve [] si el body no es JSON válido", async () => {
  const messages = await parseIncoming("no-es-json", new Headers(), {});
  assert.deepEqual(messages, []);
});

test("sendMessage llama a la Graph API con el formato correcto", async () => {
  let capturedUrl, capturedBody, capturedHeaders;
  globalThis.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedBody = JSON.parse(opts.body);
    capturedHeaders = opts.headers;
    return { ok: true, status: 200, text: async () => "" };
  };

  await sendMessage(
    { channel: "whatsapp", externalUserId: "5215512345678", text: "Hola, claro que sí" },
    { WHATSAPP_PHONE_NUMBER_ID: "1234567890", WHATSAPP_ACCESS_TOKEN: "token-abc" }
  );

  assert.match(capturedUrl, /\/1234567890\/messages$/);
  assert.equal(capturedBody.to, "5215512345678");
  assert.equal(capturedBody.text.body, "Hola, claro que sí");
  assert.equal(capturedHeaders.authorization, "Bearer token-abc");
});

test("sendMessage lanza error si faltan credenciales", async () => {
  await assert.rejects(() => sendMessage({ externalUserId: "x", text: "y" }, {}));
});
