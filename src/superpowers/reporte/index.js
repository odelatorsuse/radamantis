// src/superpowers/reporte/index.js
// Superpoder #7: reporte diario — resumen de métricas del día anterior
// mandado por WhatsApp al admin del negocio. Pensado para correr una vez al
// día desde el cron trigger (ver src/core/index.js `scheduled`).

import { sendMessage as sendWhatsapp } from "../../integrations/whatsapp/index.js";

/**
 * @param {import("../../core/metrics.js").MetricsSnapshot} snapshot
 * @param {Record<string, any>} env
 * @returns {string}
 */
export function buildDailyReportText(snapshot, env) {
  const businessName = env?.BUSINESS_DISPLAY_NAME || env?.BUSINESS_SLUG || "tu negocio";
  const resolvedPct =
    snapshot.messagesToday > 0
      ? Math.max(0, Math.round((1 - snapshot.handoffsToday / snapshot.messagesToday) * 100))
      : 100;

  return [
    `📊 REPORTE DIARIO — ${businessName}`,
    ``,
    `Mensajes hoy: ${snapshot.messagesToday}`,
    `Clientes únicos: ${snapshot.uniqueUsersToday}`,
    `Citas nuevas: ${snapshot.appointmentsToday}`,
    `Handoffs a humano: ${snapshot.handoffsToday}`,
    `Resueltas sin humano (estimado): ${resolvedPct}%`,
    `Costo del mes (LLM): $${snapshot.costUsdThisMonth.toFixed(2)}`,
  ].join("\n");
}

/**
 * Envía el reporte diario por WhatsApp al admin. No lanza si falla el envío.
 * @param {import("../../core/metrics.js").MetricsSnapshot} snapshot
 * @param {Record<string, any>} env
 */
export async function sendDailyReport(snapshot, env) {
  const adminNumber = env?.ADMIN_WHATSAPP_NUMBER;
  if (!adminNumber) {
    console.warn("[reporte] ADMIN_WHATSAPP_NUMBER no configurado — no se pudo mandar el reporte diario.");
    return;
  }
  try {
    await sendWhatsapp(
      { channel: "whatsapp", externalUserId: adminNumber, text: buildDailyReportText(snapshot, env) },
      env
    );
  } catch (err) {
    console.error("[reporte] no se pudo enviar el reporte diario:", err?.message || err);
  }
}

export default { buildDailyReportText, sendDailyReport };
