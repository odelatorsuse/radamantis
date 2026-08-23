// src/llm/gemini_adapter.js
// Estado: PENDIENTE de implementación real (Gemini 1.5 Pro vía Google AI API).
// Cumple el mismo contrato que claude_adapter.js para que el router pueda
// intercambiarlo sin cambios en src/core.

import { LLMProviderError } from "./types.js";

export const providerName = "gemini";

/**
 * @param {import("./types.js").ChatRequest} _request
 * @param {Record<string,string>} _env
 * @returns {Promise<import("./types.js").ChatResponse>}
 */
export async function chat(_request, _env) {
  throw new LLMProviderError("gemini_adapter aún no implementado", {
    provider: "gemini",
    retryable: false,
  });
}

export default { providerName, chat };
