// src/llm/openai_adapter.js
// Adaptador para OpenAI (Chat Completions API) vía fetch nativo — mismo
// patrón que claude_adapter.js, sin SDK, para compatibilidad directa con
// Cloudflare Workers.
//
// Requiere env.OPENAI_API_KEY (ver .env.example).

import { LLMProviderError, matchPricing } from "./types.js";

const API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";

// Precio por 1M de tokens (USD). Verificar contra la tarifa vigente de
// OpenAI antes de confiar en costos reportados a largo plazo — cambia con
// el tiempo y costos_presupuesto depende de esta tabla.
const PRICING_USD_PER_1M = {
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

function estimateCostUsd(model, inputTokens, outputTokens) {
  // OpenAI suele responder con la variante fechada (ej. "gpt-4o-2024-08-06")
  // aunque se pida "gpt-4o" sin fecha — matchPricing tolera eso.
  const rate = matchPricing(PRICING_USD_PER_1M, model);
  if (!rate) return 0; // modelo desconocido: no se puede tarifar, se reporta 0 explícitamente
  return (
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output
  );
}

function mapStopReason(openaiReason) {
  switch (openaiReason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    default:
      return "end_turn";
  }
}

export const providerName = "openai";

/**
 * @param {import("./types.js").ChatRequest} request
 * @param {Record<string,string>} env
 * @returns {Promise<import("./types.js").ChatResponse>}
 */
export async function chat(request, env) {
  const apiKey = env?.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LLMProviderError("OPENAI_API_KEY no configurada", {
      provider: "openai",
      retryable: false,
    });
  }

  const model = request.model || DEFAULT_MODEL;
  const messages = [];
  if (request.system) messages.push({ role: "system", content: request.system });
  for (const m of request.messages || []) {
    messages.push({ role: m.role, content: m.content });
  }

  const body = {
    model,
    messages,
    max_tokens: request.maxTokens ?? 1024,
    temperature: request.temperature ?? 0.7,
  };

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new LLMProviderError(`Fallo de red hacia OpenAI: ${err.message}`, {
      provider: "openai",
      retryable: true,
      cause: err,
    });
  }

  if (!res.ok) {
    const status = res.status;
    let errPayload;
    try {
      errPayload = await res.json();
    } catch {
      errPayload = { error: { message: await res.text().catch(() => "") } };
    }
    const retryable = status === 429 || status >= 500;
    throw new LLMProviderError(
      `OpenAI API error ${status}: ${errPayload?.error?.message || "sin detalle"}`,
      { provider: "openai", status, retryable, cause: errPayload }
    );
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? "";

  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  return {
    text,
    provider: "openai",
    model: data.model || model,
    usage: {
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(data.model || model, inputTokens, outputTokens),
    },
    stopReason: mapStopReason(choice?.finish_reason),
    raw: data,
  };
}

export default { providerName, chat };
