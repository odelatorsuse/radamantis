// test/openai_adapter.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chat } from "../src/llm/openai_adapter.js";
import { LLMProviderError } from "../src/llm/types.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchOnce(responseInit) {
  globalThis.fetch = async () => ({
    ok: responseInit.status < 400,
    status: responseInit.status,
    json: async () => responseInit.body,
    text: async () => JSON.stringify(responseInit.body),
  });
}

test("chat() lanza LLMProviderError si falta OPENAI_API_KEY", async () => {
  await assert.rejects(
    () => chat({ messages: [{ role: "user", content: "hola" }] }, {}),
    (err) => {
      assert.ok(err instanceof LLMProviderError);
      assert.equal(err.provider, "openai");
      assert.equal(err.retryable, false);
      return true;
    }
  );
});

test("chat() parsea correctamente una respuesta exitosa de OpenAI", async () => {
  mockFetchOnce({
    status: 200,
    body: {
      model: "gpt-4o",
      choices: [{ message: { content: "Hola, ¿en qué te ayudo?" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 40, completion_tokens: 10 },
    },
  });

  const res = await chat(
    { messages: [{ role: "user", content: "hola" }] },
    { OPENAI_API_KEY: "sk-test-123" }
  );

  assert.equal(res.text, "Hola, ¿en qué te ayudo?");
  assert.equal(res.provider, "openai");
  assert.equal(res.model, "gpt-4o");
  assert.equal(res.usage.inputTokens, 40);
  assert.equal(res.usage.outputTokens, 10);
  assert.ok(res.usage.costUsd > 0);
  assert.equal(res.stopReason, "end_turn");
});

test("chat() calcula costUsd aunque OpenAI devuelva una variante fechada del modelo (ej. gpt-4o-2024-08-06)", async () => {
  mockFetchOnce({
    status: 200,
    body: {
      model: "gpt-4o-2024-08-06", // así respondió el deploy real, aunque pedimos "gpt-4o"
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 157, completion_tokens: 48 },
    },
  });

  const res = await chat(
    { messages: [{ role: "user", content: "hola" }] },
    { OPENAI_API_KEY: "sk-test-123" }
  );

  assert.equal(res.model, "gpt-4o-2024-08-06");
  assert.ok(res.usage.costUsd > 0, "costUsd no debería quedar en 0 por una variante fechada del modelo");
});

test("chat() marca como retryable un error 429/5xx de OpenAI", async () => {
  mockFetchOnce({ status: 500, body: { error: { message: "server error" } } });
  await assert.rejects(
    () => chat({ messages: [{ role: "user", content: "hola" }] }, { OPENAI_API_KEY: "sk-test" }),
    (err) => {
      assert.equal(err.status, 500);
      assert.equal(err.retryable, true);
      return true;
    }
  );
});

test("chat() marca como NO retryable un error 401 de OpenAI (key inválida)", async () => {
  mockFetchOnce({ status: 401, body: { error: { message: "invalid api key" } } });
  await assert.rejects(
    () => chat({ messages: [{ role: "user", content: "hola" }] }, { OPENAI_API_KEY: "sk-bad" }),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.retryable, false);
      return true;
    }
  );
});
