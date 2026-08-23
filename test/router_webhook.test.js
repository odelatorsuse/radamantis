// test/router_webhook.test.js
// Cubre router.js con la integración real de WhatsApp (no un mock de canal):
// handshake GET, verificación de firma, y el flujo POST completo
// parseIncoming -> orchestrator -> sendMessage.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handleWebhook, handleWebhookVerification, ChannelNotImplementedError } from "../src/core/router.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

const ENV = {
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify-me",
  WHATSAPP_APP_SECRET: "app-secret",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_ACCESS_TOKEN: "token-abc",
  OPENAI_API_KEY: "sk-test",
  LLM_DEFAULT_PROVIDER: "openai",
  BUSINESS_DISPLAY_NAME: "Negocio de Prueba",
};

test("handleWebhookVerification resuelve el handshake de WhatsApp", async () => {
  const url = new URL(
    "https://x.workers.dev/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=xyz"
  );
  const challenge = await handleWebhookVerification("whatsapp", url, ENV);
  assert.equal(challenge, "xyz");
});

test("handleWebhookVerification lanza ChannelNotImplementedError para un canal sin integración", async () => {
  const url = new URL("https://x.workers.dev/webhook/instagram?hub.mode=subscribe");
  await assert.rejects(
    () => handleWebhookVerification("instagram", url, ENV),
    ChannelNotImplementedError
  );
});

test("handleWebhook rechaza un POST con firma inválida", async () => {
  const rawBody = JSON.stringify({ entry: [] });
  const request = new Request("https://x.workers.dev/webhook/whatsapp", {
    method: "POST",
    headers: { "x-hub-signature-256": "sha256=firma-falsa" },
    body: rawBody,
  });
  await assert.rejects(() => handleWebhook("whatsapp", request, ENV), /Firma de webhook inválida/);
});

test("handleWebhook procesa un mensaje real de WhatsApp de punta a punta", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.openai.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "gpt-4o",
          choices: [{ message: { content: "Claro, déjame revisar la agenda" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 20, completion_tokens: 8 },
        }),
      };
    }
    if (String(url).includes("graph.facebook.com")) {
      return { ok: true, status: 200, text: async () => "" };
    }
    throw new Error(`fetch no esperado a ${url}`);
  };

  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: "5215512345678",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "hola" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", ENV.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");

  const request = new Request("https://x.workers.dev/webhook/whatsapp", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${signature}` },
    body: rawBody,
  });

  const replies = await handleWebhook("whatsapp", request, ENV);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].channel, "whatsapp");
  assert.equal(replies[0].text, "Claro, déjame revisar la agenda");
});
