// src/llm/openai_adapter.js
// Estado: PENDIENTE de implementación real (GPT-4o vía OpenAI API).
// Cumple el mismo contrato que claude_adapter.js para que el router pueda
// intercambiarlo sin cambios en src/core.

import { LLMProviderError } from "./types.js";

export const providerName = "openai";

/**
 * @param {import("./types.js").ChatRequest} _request
 * @param {Record<string,string>} _env
 * @returns {Promise<import("./types.js").ChatResponse>}
 */
export async function chat(_request, _env) {
  throw new LLMProviderError("openai_adapter aún no implementado", {
    provider: "openai",
    retryable: false,
  });
}

export default { providerName, chat };
