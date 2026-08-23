// src/superpowers/multiidioma/index.js
// Superpoder #8: multi-idioma (es/en/pt). Heurística ligera por palabras
// clave — sin llamar a un modelo aparte, para no sumar latencia/costo a
// cada mensaje. El system prompt base ya le pide al LLM responder "en el
// idioma del usuario"; esto lo hace más confiable con mensajes cortos donde
// el modelo podría no inferir bien el idioma, nombrándolo explícitamente.

const ES_WORDS = new Set([
  "el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "por", "para", "con", "es", "no", "si",
  "hola", "gracias", "cuanto", "donde", "como", "tienen", "quiero", "necesito", "buenas", "buenos", "cita",
  "ayuda", "puedo", "cuando", "hoy", "manana", "gracias", "porfavor",
]);

const EN_WORDS = new Set([
  "the", "is", "are", "and", "you", "please", "hello", "hi", "thanks", "thank", "how", "much", "where",
  "need", "want", "can", "could", "would", "yes", "appointment", "today", "tomorrow", "help", "when",
]);

const PT_WORDS = new Set([
  "o", "a", "os", "as", "de", "que", "e", "em", "um", "uma", "por", "para", "com", "nao", "sim", "ola",
  "obrigado", "obrigada", "quanto", "onde", "como", "preciso", "quero", "bom", "boa", "ajuda", "quando",
]);

const LANGUAGE_NAMES = { es: "español", en: "inglés", pt: "portugués" };

function stripAccents(str) {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Detecta es/en/pt en un mensaje corto. Por defecto (texto ambiguo, muy
 * corto, o empate) devuelve "es" — mercado principal de Radamantis.
 * @param {string} text
 * @returns {"es"|"en"|"pt"}
 */
export function detectLanguage(text) {
  if (!text || text.trim().length < 3) return "es";

  // Señales fuertes de forma, antes de tokenizar (no dependen de listas de
  // palabras y son casi inequívocas).
  if (/[ñ¿¡]/.test(text)) return "es";
  if (/[ãõ]/.test(text) || /\bn[aã]o\b/i.test(text)) return "pt";

  const words = stripAccents(text.toLowerCase())
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (words.length === 0) return "es";

  let es = 0, en = 0, pt = 0;
  for (const w of words) {
    if (ES_WORDS.has(w)) es++;
    if (EN_WORDS.has(w)) en++;
    if (PT_WORDS.has(w)) pt++;
  }

  if (en > es && en > pt) return "en";
  if (pt > es && pt > en) return "pt";
  return "es";
}

/**
 * Línea adicional para el system prompt cuando el idioma detectado no es el
 * default del negocio — vacío si es español (ya cubierto por la instrucción
 * base) o si no se detectó nada distinto.
 * @param {"es"|"en"|"pt"} detectedLanguage
 * @returns {string}
 */
export function buildLanguageHint(detectedLanguage) {
  if (!detectedLanguage || detectedLanguage === "es") return "";
  const name = LANGUAGE_NAMES[detectedLanguage];
  if (!name) return "";
  return `El mensaje del cliente parece estar en ${name}; responde en ${name} salvo que el negocio indique lo contrario.`;
}

export default { detectLanguage, buildLanguageHint };
