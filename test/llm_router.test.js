// test/llm_router.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createLLMRouter } from "../src/llm/index.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

test("router usa el proveedor por defecto (claude) cuando responde OK", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: "claude-3-5-sonnet-20241022",
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 2 },
    }),
  });

  const router = createLLMRouter({ ANTHROPIC_API_KEY: "sk-test", LLM_DEFAULT_PROVIDER: "claude" });
  const res = await router.chat({ messages: [{ role: "user", content: "hola" }] });
  assert.equal(res.provider, "claude");
  assert.equal(res.text, "ok");
});

test("router propaga error final cuando todos los proveedores fallan", async () => {
  const router = createLLMRouter({ LLM_DEFAULT_PROVIDER: "openai" }); // sin API key -> falla, y sin fallback real implementado
  await assert.rejects(() =>
    router.chat({ messages: [{ role: "user", content: "hola" }] })
  );
});
