// src/llm/index.js
// Router del motor multi-modelo. Selecciona el proveedor por
// env.LLM_DEFAULT_PROVIDER y, si falla con un error "retryable",
// hace fallback en orden a los proveedores disponibles en env.LLM_FALLBACK_ORDER
// (o al orden por defecto declarado abajo).
//
// src/core NUNCA debe importar un adaptador directamente: siempre pasa por
// createLLMRouter(env).chat(request).

import { LLMProviderError } from "./types.js";
import claudeAdapter from "./claude_adapter.js";
import openaiAdapter from "./openai_adapter.js";
import geminiAdapter from "./gemini_adapter.js";
import grokAdapter from "./grok_adapter.js";

const ADAPTERS = {
  claude: claudeAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
  grok: grokAdapter,
};

const DEFAULT_FALLBACK_ORDER = ["claude", "openai", "gemini", "grok"];

/**
 * @param {Record<string,string>} env
 */
export function createLLMRouter(env) {
  const defaultProvider = env?.LLM_DEFAULT_PROVIDER || "claude";
  const fallbackOrder = (env?.LLM_FALLBACK_ORDER
    ? env.LLM_FALLBACK_ORDER.split(",").map((s) => s.trim())
    : DEFAULT_FALLBACK_ORDER
  ).filter((name, i, arr) => arr.indexOf(name) === i); // dedupe

  // El proveedor por defecto siempre va primero en la cadena de intento.
  const attemptOrder = [
    defaultProvider,
    ...fallbackOrder.filter((p) => p !== defaultProvider),
  ];

  /**
   * @param {import("./types.js").ChatRequest} request
   * @returns {Promise<import("./types.js").ChatResponse>}
   */
  async function chat(request) {
    /** @type {LLMProviderError[]} */
    const errors = [];

    for (const providerName of attemptOrder) {
      const adapter = ADAPTERS[providerName];
      if (!adapter) continue;

      try {
        return await adapter.chat(request, env);
      } catch (err) {
        const wrapped =
          err instanceof LLMProviderError
            ? err
            : new LLMProviderError(err?.message || "Error desconocido", {
                provider: providerName,
                retryable: false,
                cause: err,
              });
        errors.push(wrapped);

        // Si el error no es reintentable (ej. request inválido), no tiene
        // sentido seguir probando otros proveedores con el mismo request.
        if (!wrapped.retryable) continue;
      }
    }

    const summary = errors
      .map((e) => `${e.provider}: ${e.message}`)
      .join(" | ");
    throw new LLMProviderError(
      `Todos los proveedores LLM fallaron. ${summary}`,
      { provider: "router", retryable: false, cause: errors }
    );
  }

  return { chat, defaultProvider, attemptOrder };
}

export { ADAPTERS };
export * from "./types.js";
