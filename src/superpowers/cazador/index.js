// src/superpowers/cazador/index.js
// Superpoder #3: "cazador de ventas" — sigue conversaciones "calientes"
// (el bot respondió algo con intención de venta/agenda y el cliente se
// quedó callado) y manda un follow-up entre 3 y 20 horas después, antes de
// que el interés se enfríe del todo. Corre desde el cron (ver
// src/core/index.js `scheduled`), no en el pipeline por-mensaje.

import { sendMessage as sendWhatsapp } from "../../integrations/whatsapp/index.js";
import { createSessionStore } from "../../core/session.js";

const MIN_SILENCE_MS = 3 * 60 * 60 * 1000; // 3 horas
const MAX_SILENCE_MS = 20 * 60 * 60 * 1000; // 20 horas

/**
 * Una sesión es candidata a follow-up "caliente" si: el último turno fue del
 * bot (el cliente se quedó sin responder), pasaron entre 3 y 20 horas, es un
 * canal donde sabemos re-contactar (WhatsApp), y no se le hizo ya un
 * follow-up ni se escaló a un humano (no hace sentido cazar una venta que ya
 * está en manos de una persona).
 * @param {import("../../core/types.js").Session} session
 * @param {number} [now]
 * @returns {boolean}
 */
export function isHotFollowUpCandidate(session, now = Date.now()) {
  if (!session || session.channel !== "whatsapp") return false;
  if (session.state?.followedUpAt || session.state?.handoffRequestedAt) return false;
  const last = session.history?.[session.history.length - 1];
  if (!last || last.role !== "assistant") return false;
  const elapsed = now - session.updatedAt;
  return elapsed >= MIN_SILENCE_MS && elapsed < MAX_SILENCE_MS;
}

function lastUserMessage(session) {
  for (let i = session.history.length - 1; i >= 0; i--) {
    if (session.history[i].role === "user") return session.history[i].content;
  }
  return null;
}

/**
 * @param {import("../../core/types.js").Session} session
 * @param {Record<string, any>} env
 * @returns {string}
 */
export function buildFollowUpMessage(session, env) {
  const businessName = env?.BUSINESS_DISPLAY_NAME || "nosotros";
  const lastText = lastUserMessage(session);
  const context = lastText ? ` sobre "${lastText.slice(0, 80)}"` : "";
  return `¡Hola! 👋 Vimos que quedamos platicando${context} y quisimos darle seguimiento. ¿Sigue interesado(a)? Con gusto te ayudamos a resolver cualquier duda o a agendar — soy el asistente de ${businessName}.`;
}

/**
 * Recorre todas las sesiones del negocio y manda follow-up a las candidatas.
 * No lanza si un envío individual falla — sigue con el resto del sweep.
 * @param {Record<string, any>} env
 * @param {number} [now]
 * @returns {Promise<{checked: number, followedUp: number}>}
 */
export async function sweepHotLeads(env, now = Date.now()) {
  const store = createSessionStore(env);
  if (typeof store.listAll !== "function") return { checked: 0, followedUp: 0 };

  const sessions = await store.listAll();
  let followedUp = 0;

  for (const session of sessions) {
    if (!isHotFollowUpCandidate(session, now)) continue;
    try {
      await sendWhatsapp(
        { channel: "whatsapp", externalUserId: session.externalUserId, text: buildFollowUpMessage(session, env) },
        env
      );
      session.state = { ...session.state, followedUpAt: now };
      await store.save(session);
      followedUp++;
    } catch (err) {
      console.error(`[cazador] no se pudo enviar follow-up a ${session.externalUserId}:`, err?.message || err);
    }
  }

  return { checked: sessions.length, followedUp };
}

export default { isHotFollowUpCandidate, buildFollowUpMessage, sweepHotLeads };
