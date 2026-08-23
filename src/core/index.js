// src/core/index.js
// Entry point del Cloudflare Worker (ver wrangler.toml: main = "src/core/index.js").
//
// Rutas:
//   GET  /health                  -> liveness check
//   POST /webhook/:channel        -> dispatch a src/integrations/<channel>
//
// El cron diario (superpoder #7 "reporte") se registra vía el handler
// `scheduled` más abajo cuando se agregue el trigger en wrangler.toml
// (aún pendiente: [triggers] crons = [...]).

import { handleWebhook, ChannelNotImplementedError } from "./router.js";

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
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
      return json({ status: "ok", service: "radamantis", ts: Date.now() });
    }

    const webhookMatch = url.pathname.match(/^\/webhook\/([a-z_]+)$/);
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
