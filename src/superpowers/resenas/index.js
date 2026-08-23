// src/superpowers/resenas/index.js
// Superpoder #11: pedir reseña (Google/Trustpilot) — solo a clientes que ya
// dieron una calificación CSAT alta (superpoder #9, encuestas), y solo una
// vez por conversación. Requiere que el negocio configure `reviewUrl` en
// businesses/<slug>.json (se expone como env.REVIEW_URL).

const MIN_CSAT_FOR_REVIEW_REQUEST = 4;

/**
 * @param {import("../../core/types.js").Session} session
 * @param {Record<string, any>} env
 * @returns {boolean}
 */
export function shouldRequestReview(session, env) {
  if (!env?.REVIEW_URL) return false;
  if (!session) return false;
  if (session.state?.reviewRequestedAt) return false;
  const csat = session.state?.surveyResponse;
  return typeof csat === "number" && csat >= MIN_CSAT_FOR_REVIEW_REQUEST;
}

/**
 * @param {Record<string, any>} env
 * @returns {string}
 */
export function buildReviewRequestMessage(env) {
  return `¡Nos alegra que te haya servido! Si tienes 30 segundos, nos ayudaría muchísimo que dejaras tu reseña aquí: ${env.REVIEW_URL} 🙏`;
}

export default { shouldRequestReview, buildReviewRequestMessage };
