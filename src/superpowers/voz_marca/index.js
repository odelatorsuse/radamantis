// src/superpowers/voz_marca/index.js
// Superpoder #6: "voz de marca" — piso mínimo (nombre del negocio + tono +
// instrucciones específicas desde businesses/<slug>.json -> systemPromptExtra
// se inyectan siempre en el system prompt). La versión completa (ajustar
// estilo de escritura según voiceTone: formal/cálido/directo/etc. con
// ejemplos few-shot) queda como mejora incremental — ver docs/CHECKLIST.md.

const TONE_HINTS = {
  calido: "Usa un tono cálido y cercano, como alguien que conoce bien el negocio.",
  cercano: "Usa un tono cercano y relajado, sin sonar corporativo.",
  directo: "Usa un tono directo y al grano, sin rodeos innecesarios.",
  profesional: "Usa un tono profesional y formal.",
  profesional_calido: "Usa un tono profesional pero cálido — cercano sin perder seriedad.",
  sereno: "Usa un tono sereno y tranquilo.",
  energico: "Usa un tono energético y motivador.",
};

/**
 * @param {Record<string, any>} env
 * @returns {string}
 */
export function buildBrandVoiceInstruction(env) {
  const businessName = env?.BUSINESS_DISPLAY_NAME || "la marca";
  const toneHint = TONE_HINTS[env?.VOICE_TONE] || "";
  const extra = env?.SYSTEM_PROMPT_EXTRA || "";

  return [
    `Eres el asistente virtual de ${businessName}. Responde de forma clara, concisa y en el idioma del usuario.`,
    toneHint,
    extra,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export default { buildBrandVoiceInstruction };
