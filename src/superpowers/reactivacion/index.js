// src/superpowers/reactivacion/index.js
// Superpoder #10: reactivación de leads fríos — a diferencia de "cazador"
// (seguimiento de una venta caliente en las primeras 20h), esto vuelve a
// tocar la puerta de conversaciones que llevan DÍAS sin actividad, con un
// tono de "seguimos aquí" en vez de presión de cierre. Corre desde el cron.

import { sendMessage as sendWhatsapp } from "../../integrations/whatsapp/index.js";
import { createSessionStore } from "../../core/session.js";

const MIN_COLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 días
const MAX_COLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 días — pasado esto ya no se reactiva (evita spam a leads muy viejos)

/**
 * @param {import("../../core/types.js").Session} session
 * @param {number} [now]
 * @returns {boolean}
 */
export function isColdLeadCandidate(session, now = Date.now()) {
  if (!session || session.channel !== "whatsapp") return false;
  if (session.state?.reactivatedAt || session.state?.handoffRequestedAt) return false;
  if (!session.history?.length) return false;
  const elapsed = now - session.updatedAt;
  return elapsed >= MIN_COLD_MS && elapsed < MAX_COLD_MS;
}

/**
 * @param {Record<string, any>} env
 * @returns {string}
 */
export function buildReactivationMessage(env) {
  const businessName = env?.BUSINESS_DISPLAY_NAME || "nosotros";
  return `¡Hola de nuevo! 👋 Soy el asistente de ${businessName}. Hace un tiempo platicamos y queríamos saber si te podemos ayudar en algo — con gusto retomamos donde nos quedamos.`;
}

/**
 * @param {Record<string, any>} env
 * @param {number} [now]
 * @returns {Promise<{checked: number, reactivated: number}>}
 */
export async function sweepColdLeads(env, now = Date.now()) {
  const store = createSessionStore(env);
  if (typeof store.listAll !== "function") return { checked: 0, reactivated: 0 };

  const sessions = await store.listAll();
  let reactivated = 0;

  for (const session of sessions) {
    if (!isColdLeadCandidate(session, now)) continue;
    try {
      await sendWhatsapp(
        { channel: "whatsapp", externalUserId: session.externalUserId, text: buildReactivationMessage(env) },
        env
      );
      session.state = { ...session.state, reactivatedAt: now };
      await store.save(session);
      reactivated++;
    } catch (err) {
      console.error(`[reactivacion] no se pudo reactivar a ${session.externalUserId}:`, err?.message || err);
    }
  }

  return { checked: sessions.length, reactivated };
}

export default { isColdLeadCandidate, buildReactivationMessage, sweepColdLeads };
