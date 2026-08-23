// src/superpowers/handoff/index.js
// Superpoder #4: "handoff que atina" — detecta cuándo el cliente pide un
// humano y transfiere vía WhatsApp al admin con un resumen estructurado del
// caso (no solo "alguien te pidió ayuda", sino el contexto para que el
// humano no tenga que releer todo el chat).

import { sendMessage as sendWhatsapp } from "../../integrations/whatsapp/index.js";

const HANDOFF_PATTERNS = [
  /\bhablar\b.{0,20}\b(persona|humano|agente|alguien real)\b/i,
  /\bquiero\b.{0,15}\b(agente|representante|supervisor|humano)\b/i,
  /\bno (eres|es)\b.{0,10}\b(una persona|un humano)\b/i,
  /\b(pasame|p[aá]same|pasar(me)?|comun[ií]ca(me)?|conect(a|ame)|transfi[eé]r(e|eme))\b.{0,20}\bcon\b.{0,15}\b(alguien|una persona|un agente|un humano)\b/i,
  /\beres (un bot|una ia|un robot)\b.{0,30}\b(persona|humano)\b/i,
];

/**
 * @param {string} text
 * @returns {boolean}
 */
export function detectHandoffRequest(text) {
  if (!text) return false;
  return HANDOFF_PATTERNS.some((p) => p.test(text));
}

function formatHistory(session, maxMessages = 6) {
  return session.history
    .slice(-maxMessages)
    .map((m) => `${m.role === "user" ? "Cliente" : "Bot"}: ${m.content}`)
    .join("\n");
}

/**
 * Escala la conversación a un humano: envía resumen estructurado por
 * WhatsApp al admin del negocio. No lanza si falla el envío.
 * @param {Object} params
 * @param {import("../../core/types.js").Session} params.session
 * @param {string} params.messageText
 * @param {Record<string, any>} env
 */
export async function escalate({ session, messageText }, env) {
  // Se marca la sesión como "pidió humano" pase lo que pase con el envío de
  // la alerta — los sweeps de cazador/reactivación (superpoderes #3 y #10)
  // usan esta bandera para no seguir mandando follow-ups automáticos a
  // alguien que ya está esperando a una persona.
  session.state = { ...session.state, handoffRequestedAt: Date.now() };

  const adminNumber = env?.ADMIN_WHATSAPP_NUMBER;
  if (!adminNumber) {
    console.warn("[handoff] se pidió un humano pero ADMIN_WHATSAPP_NUMBER no está configurado — no se pudo escalar.");
    return;
  }

  const businessName = env?.BUSINESS_DISPLAY_NAME || env?.BUSINESS_SLUG || "tu negocio";
  const text = [
    `🙋 HANDOFF — ${businessName}`,
    `Cliente pidió hablar con una persona.`,
    `Cliente: ${session.externalUserId} (${session.channel})`,
    `Último mensaje: "${messageText}"`,
    ``,
    `Últimos turnos:`,
    formatHistory(session) || "(sin historial previo)",
  ].join("\n");

  try {
    await sendWhatsapp({ channel: "whatsapp", externalUserId: adminNumber, text }, env);
  } catch (err) {
    console.error("[handoff] no se pudo enviar el resumen a WhatsApp admin:", err?.message || err);
  }
}

export default { detectHandoffRequest, escalate };
