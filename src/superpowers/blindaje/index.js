// src/superpowers/blindaje/index.js
// Superpoder #1: "blindaje anti-invento" — piso mínimo (instrucción de
// grounding en el system prompt: si no hay certeza, decirlo en vez de
// inventar). La versión completa (RAG estricto: buscar en documentos reales
// del negocio antes de responder, citar la fuente) queda pendiente — ver
// docs/CHECKLIST.md. Este piso mínimo SÍ está activo en cada request, no es
// decorativo.

/**
 * @returns {string}
 */
export function buildGroundingInstruction() {
  return 'Si no tienes certeza sobre un dato (precios, disponibilidad, políticas, horarios), NO inventes: dilo explícitamente y ofrece confirmarlo ("déjame confirmarlo y te aviso") en lugar de adivinar.';
}

export default { buildGroundingInstruction };
