// src/superpowers/encuestas/index.js
// Superpoder #9: encuestas CSAT (1-5). Se pregunta una sola vez por
// conversación, después de un mínimo de turnos reales, y solo si no hubo ya
// un handoff (a alguien que pidió un humano no le preguntamos qué tal
// estuvo el bot). La respuesta se parsea en el turno siguiente, ANTES de
// mandar el mensaje al LLM — ver src/core/orchestrator.js.

const MIN_USER_TURNS_BEFORE_SURVEY = 4;

/**
 * @param {import("../../core/types.js").Session} session
 * @returns {boolean}
 */
export function shouldSendSurvey(session) {
  if (!session) return false;
  if (session.state?.surveySentAt || session.state?.surveyResponse != null) return false;
  if (session.state?.handoffRequestedAt) return false;
  const userTurns = session.history.filter((m) => m.role === "user").length;
  return userTurns >= MIN_USER_TURNS_BEFORE_SURVEY;
}

/**
 * @returns {string}
 */
export function buildSurveyMessage() {
  return "Antes de terminar: del 1 al 5, ¿qué tan útil fue esta conversación? Solo responde con el número 🙂";
}

/**
 * true si la sesión está esperando la respuesta numérica de una encuesta ya
 * enviada.
 * @param {import("../../core/types.js").Session} session
 * @returns {boolean}
 */
export function isAwaitingSurveyReply(session) {
  return !!(session?.state?.surveySentAt && session?.state?.surveyResponse == null);
}

/**
 * Extrae una calificación 1-5 de la respuesta del cliente. Acepta números
 * sueltos ("4", "4/5", "le doy un 5") — null si no se pudo interpretar
 * (el cliente probablemente escribió otra cosa, no respondió la encuesta).
 * @param {string} text
 * @returns {number|null}
 */
export function parseCsatResponse(text) {
  if (!text) return null;
  const match = String(text).match(/\b([1-5])\b/);
  return match ? Number(match[1]) : null;
}

export default { shouldSendSurvey, buildSurveyMessage, isAwaitingSurveyReply, parseCsatResponse };
