// src/llm/claude_adapter.js
// Adaptador para Anthropic Claude (Messages API) vía fetch nativo — sin SDK,
// para compatibilidad directa con el runtime de Cloudflare Workers.
//
// Requiere env.ANTHROPIC_API_KEY (ver .env.example).

import { LLMProviderError, matchPricing } from "./types.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

// Precio por 1M de tokens (USD). Actualizar si Anthropic cambia tarifas.
// Fuente: pricing público de Anthropic al momento de escribir este adaptador;
// no se debe asumir vigente sin verificar — costos_presupuesto lee de aquí.
const PRICING_USD_PER_1M = {
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  "claude-3-opus-20240229": { input: 15.0, output: 75.0 },
};

function estimateCostUsd(model, inputTokens, outputTokens) {
  const rate = matchPricing(PRICING_USD_PER_1M, model);
  if (!rate) return 0; // modelo desconocido: no se puede tarifar, se reporta 0 explícitamente
  return (
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output
  );
}

function mapStopReason(anthropicReason) {
  switch (anthropicReason) {
    case "end_turn":
    case "stop_sequence":
      return anthropicReason;
    case "max_tokens":
      return "max_tokens";
    default:
      return "end_turn";
  }
}

/**
 * @param {import("./types.js").ChatRequest} request
 * @param {Record<string,string>} env
 * @returns {Promise<import("./types.js").ChatResponse>}
 */
export async function chat(request, env) {
  const apiKey = env?.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LLMProviderError("ANTHROPIC_API_KEY no configurada", {
      provider: "claude",
      retryable: false,
    });
  }

  const model = request.model || DEFAULT_MODEL;
  const body = {
    model,
    max_tokens: request.maxTokens ?? 1024,
    temperature: request.temperature ?? 0.7,
    messages: (request.messages || []).map((m) => ({
      role: m.role === "system" ? "user" : m.role, // el system va aparte en Anthropic
      content: m.content,
    })),
  };
  if (request.system) body.system = request.system;

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new LLMProviderError(`Fallo de red hacia Anthropic: ${err.message}`, {
      provider: "claude",
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
      `Anthropic API error ${status}: ${errPayload?.error?.message || "sin detalle"}`,
      { provider: "claude", status, retryable, cause: errPayload }
    );
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  return {
    text,
    provider: "claude",
    model: data.model || model,
    usage: {
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(data.model || model, inputTokens, outputTokens),
    },
    stopReason: mapStopReason(data.stop_reason),
    raw: data,
  };
}

export const providerName = "claude";

export default { providerName, chat };
