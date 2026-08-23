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
import { requireBasicAuth } from "./auth.js";
import { sweepHotLeads } from "../superpowers/cazador/index.js";
import { sweepColdLeads } from "../superpowers/reactivacion/index.js";
import { sendDailyReport } from "../superpowers/reporte/index.js";

// Deben coincidir EXACTO con los crons declarados en
// scripts/gen-wrangler-envs.mjs ([env.<slug>.triggers] crons = [...]) — es
// cómo `scheduled()` distingue qué disparo es cuál (controller.cron trae el
// string tal cual está configurado en wrangler.toml).
const CRON_HOURLY_SWEEPS = "0 * * * *"; // cazador (#3) + reactivación (#10)
const CRON_DAILY_REPORT = "0 14 * * *"; // reporte diario (#7) — ~8am CDMX (UTC-6, sin horario de verano)

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
      const authFailure = requireBasicAuth(request, env);
      if (authFailure) return authFailure;
      const metrics = createMetricsStore(env);
      const snapshot = await metrics.snapshot();
      return html(renderOverviewPage(env, snapshot));
    }

    if (request.method === "GET" && url.pathname === "/conexiones") {
      const authFailure = requireBasicAuth(request, env);
      if (authFailure) return authFailure;
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
   * Cron trigger — dos horarios distintos comparten este mismo handler
   * (ver CRON_HOURLY_SWEEPS / CRON_DAILY_REPORT arriba):
   *   - cada hora: cazador de ventas (#3) + reactivación de leads (#10)
   *   - una vez al día: reporte diario (#7)
   * @param {ScheduledController} controller
   * @param {Record<string, any>} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(controller, env, ctx) {
    console.log(`[radamantis] cron disparado: ${controller.cron} @ ${new Date().toISOString()}`);
    try {
      if (controller.cron === CRON_DAILY_REPORT) {
        const metrics = createMetricsStore(env);
        const snapshot = await metrics.snapshot();
        await sendDailyReport(snapshot, env);
        console.log("[radamantis] reporte diario enviado.");
        return;
      }

      // Por defecto (incluye CRON_HOURLY_SWEEPS y cualquier cron no
      // reconocido, para no dejar un trigger mal configurado sin hacer nada):
      const [hot, cold] = await Promise.all([sweepHotLeads(env), sweepColdLeads(env)]);
      console.log(
        `[radamantis] cazador: ${hot.followedUp}/${hot.checked} follow-ups enviados. reactivación: ${cold.reactivated}/${cold.checked} leads reactivados.`
      );
    } catch (err) {
      console.error("[radamantis] error en scheduled():", err);
    }
  },
};
