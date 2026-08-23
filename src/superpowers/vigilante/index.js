// src/superpowers/vigilante/index.js
// Superpoder #2: detección de sentimiento de frustración/riesgo + alerta
// push inmediata a WhatsApp admin.
//
// MVP: heurística por palabras clave (español) + señales de forma (mayúsculas
// sostenidas, signos repetidos). No usa el LLM para no sumar latencia/costo
// a cada mensaje — si en el futuro se necesita mayor precisión, se puede
// reemplazar detectRisk() por una llamada a un modelo barato (ej. haiku/mini)
// manteniendo la misma firma.

import { sendMessage as sendWhatsapp } from "../../integrations/whatsapp/index.js";

const HIGH_RISK_PATTERNS = [
  /\bquiero (mi dinero|un reembolso|cancelar)\b/i,
  /\b(demanda|abogado|profeco|denuncia)\b/i,
  /\bp[eé]sim[oa] servicio\b/i,
  /\b(nunca m[aá]s|jam[aá]s vuelvo)\b/i,
  /\bemergencia\b/i,
  /\burgente\b/i,
  /\bse est[aá] muriendo\b/i,
  /\bmuri[oó]\b/i,
];

const MEDIUM_RISK_PATTERNS = [
  /\b(estoy|est[aá]s?|est[aá]n|estamos)\s+(harto|hart[oa]|frustrad[oa]|enojad[oa]|molest[oa])\b/i,
  /\bno (funciona|sirve|responde)\b/i,
  /\bp[eé]simo\b/i,
  /\b(terrible|horrible)\b/i,
  /\bnadie (me ayuda|responde|contesta)\b/i,
  /\bllevo (\d+|varios|mucho tiempo) (d[ií]as?|horas?|semanas?)\b.*\besperando\b/i,
];

function shoutingRatio(text) {
  const letters = text.replace(/[^a-zA-Zá-úÁ-Ú]/g, "");
  if (letters.length < 8) return 0;
  const upper = letters.replace(/[^A-ZÁ-Ú]/g, "");
  return upper.length / letters.length;
}

/**
 * @param {string} text
 * @returns {{ risk: boolean, severity: "low"|"medium"|"high", reason: string|null }}
 */
export function detectRisk(text) {
  if (!text) return { risk: false, severity: "low", reason: null };

  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(text)) {
      return { risk: true, severity: "high", reason: `coincide con patrón de alto riesgo: ${pattern}` };
    }
  }
  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(text)) {
      return { risk: true, severity: "medium", reason: `coincide con patrón de frustración: ${pattern}` };
    }
  }
  if (shoutingRatio(text) > 0.6) {
    return { risk: true, severity: "medium", reason: "mensaje mayormente en mayúsculas (posible enojo)" };
  }
  if ((text.match(/!/g) || []).length >= 3) {
    return { risk: true, severity: "low", reason: "múltiples signos de exclamación seguidos" };
  }
  return { risk: false, severity: "low", reason: null };
}

/**
 * Envía una alerta al WhatsApp del administrador del negocio.
 * No lanza si falla el envío — un fallo de alerta no debe tumbar la
 * respuesta normal al cliente; el caller decide si loguear.
 * @param {Object} params
 * @param {import("../../core/types.js").Session} params.session
 * @param {string} params.messageText
 * @param {{severity: string, reason: string}} params.risk
 * @param {Record<string, any>} env
 */
export async function alertAdmin({ session, messageText, risk }, env) {
  const adminNumber = env?.ADMIN_WHATSAPP_NUMBER;
  if (!adminNumber) {
    console.warn("[vigilante] riesgo detectado pero ADMIN_WHATSAPP_NUMBER no está configurado — no se pudo alertar.", risk);
    return;
  }

  const businessName = env?.BUSINESS_DISPLAY_NAME || env?.BUSINESS_SLUG || "tu negocio";
  const text = [
    `⚠️ VIGILANTE — ${businessName}`,
    `Severidad: ${risk.severity.toUpperCase()}`,
    `Cliente: ${session.externalUserId} (${session.channel})`,
    `Mensaje: "${messageText}"`,
    risk.reason ? `Motivo: ${risk.reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await sendWhatsapp({ channel: "whatsapp", externalUserId: adminNumber, text }, env);
  } catch (err) {
    console.error("[vigilante] no se pudo enviar la alerta a WhatsApp admin:", err?.message || err);
  }
}

export default { detectRisk, alertAdmin };
