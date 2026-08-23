// test/claude_adapter.test.js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chat } from "../src/llm/claude_adapter.js";
import { LLMProviderError } from "../src/llm/types.js";

const originalFetch = globalThis.fetch;

function mockFetchOnce(responseInit) {
  globalThis.fetch = async (_url, _opts) => {
    return {
      ok: responseInit.status < 400,
      status: responseInit.status,
      json: async () => responseInit.body,
      text: async () => JSON.stringify(responseInit.body),
    };
  };
}

after(() => {
  globalThis.fetch = originalFetch;
});

test("chat() lanza LLMProviderError si falta ANTHROPIC_API_KEY", async () => {
  await assert.rejects(
    () => chat({ messages: [{ role: "user", content: "hola" }] }, {}),
    (err) => {
      assert.ok(err instanceof LLMProviderError);
      assert.equal(err.provider, "claude");
      assert.equal(err.retryable, false);
      return true;
    }
  );
});

test("chat() parsea correctamente una respuesta exitosa de Anthropic", async () => {
  mockFetchOnce({
    status: 200,
    body: {
      model: "claude-3-5-sonnet-20241022",
      content: [{ type: "text", text: "Hola, ¿en qué te ayudo?" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 50, output_tokens: 12 },
    },
  });

  const res = await chat(
    { messages: [{ role: "user", content: "hola" }] },
    { ANTHROPIC_API_KEY: "sk-test-123" }
  );

  assert.equal(res.text, "Hola, ¿en qué te ayudo?");
  assert.equal(res.provider, "claude");
  assert.equal(res.model, "claude-3-5-sonnet-20241022");
  assert.equal(res.usage.inputTokens, 50);
  assert.equal(res.usage.outputTokens, 12);
  assert.ok(res.usage.costUsd > 0);
  assert.equal(res.stopReason, "end_turn");
});

test("chat() marca como retryable un error 429/5xx de Anthropic", async () => {
  mockFetchOnce({
    status: 429,
    body: { error: { message: "rate limited" } },
  });

  await assert.rejects(
    () => chat({ messages: [{ role: "user", content: "hola" }] }, { ANTHROPIC_API_KEY: "sk-test" }),
    (err) => {
      assert.ok(err instanceof LLMProviderError);
      assert.equal(err.status, 429);
      assert.equal(err.retryable, true);
      return true;
    }
  );
});

test("chat() marca como NO retryable un error 400 de Anthropic", async () => {
  mockFetchOnce({
    status: 400,
    body: { error: { message: "bad request" } },
  });

  await assert.rejects(
    () => chat({ messages: [{ role: "user", content: "hola" }] }, { ANTHROPIC_API_KEY: "sk-test" }),
    (err) => {
      assert.ok(err instanceof LLMProviderError);
      assert.equal(err.status, 400);
      assert.equal(err.retryable, false);
      return true;
    }
  );
});
