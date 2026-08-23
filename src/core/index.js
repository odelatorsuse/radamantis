// src/core/index.js
// Entry point del Cloudflare Worker (ver wrangler.toml: main = "src/core/index.js").
//
// Rutas:
//   GET  /health                  -> liveness check
//   GET  /admin/overview          -> dashboard del bot (métricas, salud)
//   GET  /conexiones              -> marketplace de integraciones
//   POST /chat                    -> prueba manual del pipeline sin canal real
//                                     body: { "conversationId": "test-1", "text": "hola" }
//   GET  /webhook/:channel        -> handshake de verificación (ej. Meta/WhatsApp)
//   POST /webhook/:channel        -> dispatch a src/integrations/<channel>
//
// El cron diario (superpoder #7 "reporte") se registra vía el handler
// `scheduled` más abajo cuando se agregue el trigger en wrangler.toml
// (aún pendiente: [triggers] crons = [...]).

import { handleWebhook, handleWebhookVerification, ChannelNotImplementedError, buildTestMessage } from "./router.js";
import { handleIncomingMessage } from "./orchestrator.js";
import { createMetricsStore } from "./metrics.js";
import { renderOverviewPage, renderConexionesPage } from "./adminUI.js";

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
}

function html(markup, init = {}) {
  return new Response(markup, {
    ...init,
    headers: { "content-type": "text/html; charset=utf-8", ...(init.headers || {}) },
  });
}

export default {
  /**
   * @param {Request} request
   * @param {Record<string, any>} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        status: "ok",
        service: "radamantis",
        business: env?.BUSINESS_SLUG || null,
        ts: Date.now(),
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/overview") {
      const metrics = createMetricsStore(env);
      const snapshot = await metrics.snapshot();
      return html(renderOverviewPage(env, snapshot));
    }

    if (request.method === "GET" && url.pathname === "/conexiones") {
      return html(renderConexionesPage(env));
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      try {
        const body = await request.json();
        if (!body?.conversationId || !body?.text) {
          return json(
            { ok: false, error: 'Body requerido: { "conversationId": "...", "text": "..." }' },
            { status: 400 }
          );
        }
        const message = buildTestMessage({
          conversationId: body.conversationId,
          externalUserId: body.externalUserId,
          text: body.text,
        });
        const reply = await handleIncomingMessage(message, env);
        return json({ ok: true, reply });
      } catch (err) {
        console.error("[radamantis] error en /chat:", err);
        return json({ ok: false, error: err?.message || "Error interno" }, { status: 500 });
      }
    }

    const webhookMatch = url.pathname.match(/^\/webhook\/([a-z_]+)$/);

    // Handshake de verificación (Meta/WhatsApp llama GET una vez al
    // configurar la URL del webhook en su dashboard).
    if (request.method === "GET" && webhookMatch) {
      const channel = webhookMatch[1];
      try {
        const challenge = await handleWebhookVerification(channel, url, env);
        if (challenge !== null) {
          return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
        }
        return json({ ok: false, error: "Verificación de webhook fallida" }, { status: 403 });
      } catch (err) {
        if (err instanceof ChannelNotImplementedError) {
          return json({ ok: false, error: err.message }, { status: 501 });
        }
        return json({ ok: false, error: err?.message || "Error interno" }, { status: 500 });
      }
    }

    if (request.method === "POST" && webhookMatch) {
      const channel = webhookMatch[1];
      try {
        const replies = await handleWebhook(channel, request, env);
        return json({ ok: true, replies });
      } catch (err) {
        if (err instanceof ChannelNotImplementedError) {
          return json({ ok: false, error: err.message }, { status: 501 });
        }
        console.error(`[radamantis] error en webhook/${channel}:`, err);
        return json({ ok: false, error: err?.message || "Error interno" }, { status: 500 });
      }
    }

    return json({ ok: false, error: "Not found" }, { status: 404 });
  },

  /**
   * Cron trigger (reporte diario, cazador de ventas, reactivación de leads).
   * TODO(reporte): implementar generación y envío del resumen matutino.
   * TODO(cazador): implementar barrido de conversaciones enfriadas 3-20h.
   * @param {ScheduledController} controller
   * @param {Record<string, any>} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(controller, env, ctx) {
    console.log(`[radamantis] cron disparado: ${controller.cron} @ ${new Date().toISOString()}`);
    // Sin implementación aún — ver docs/CHECKLIST.md.
  },
};
