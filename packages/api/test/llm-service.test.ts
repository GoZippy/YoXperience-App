import assert from "node:assert/strict";
import test from "node:test";
import { withEnv } from "./helpers/env.js";

test("uses heuristic fallback when no supported LLM provider key is configured", async () => {
  const { generateStructuredOutput } = await import("../src/services/llm-service.js");
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called without MORPHUI_OPENAI_API_KEY");
  }) as typeof fetch;

  try {
    const output = await withEnv(
      {
        MORPHUI_OPENAI_API_KEY: undefined,
        MORPHUI_GEMINI_API_KEY: undefined,
        MORPHUI_API_KEY: "legacy-admin-key",
        MORPHUI_LLM_MODE: "remote",
      },
      async () =>
        generateStructuredOutput({
          system: "system",
          user: "user",
          fallback: () => ({ mode: "fallback" as const }),
        }),
    );

    assert.deepEqual(output, { mode: "fallback" });
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses Gemini provider when configured explicitly", async () => {
  const { generateStructuredOutput } = await import("../src/services/llm-service.js");
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    const headers = new Headers(init?.headers);
    capturedHeaders = {
      "x-goog-api-key": headers.get("x-goog-api-key") || "",
      "content-type": headers.get("content-type") || "",
    };
    capturedBody = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;

    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "{\"provider\":\"gemini\",\"ok\":true}" }],
            },
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const output = await withEnv(
      {
        MORPHUI_LLM_MODE: "remote",
        MORPHUI_LLM_PROVIDER: "gemini",
        MORPHUI_GEMINI_API_KEY: "test-gemini-key",
        MORPHUI_GEMINI_MODEL: "gemini-2.5-flash",
        MORPHUI_OPENAI_API_KEY: undefined,
      },
      async () =>
        generateStructuredOutput({
          system: "system-prompt",
          user: "user-prompt",
          fallback: () => ({ provider: "fallback", ok: false }),
        }),
    );

    assert.deepEqual(output, { provider: "gemini", ok: true });
    assert.match(capturedUrl, /generativelanguage\.googleapis\.com/);
    assert.equal(capturedHeaders["x-goog-api-key"], "test-gemini-key");
    assert.equal(capturedHeaders["content-type"], "application/json");
    assert.equal(
      (
        (capturedBody?.generationConfig as { responseMimeType?: string } | undefined)
          ?.responseMimeType
      ),
      "application/json",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back when remote LLM request returns non-2xx", async () => {
  const { generateStructuredOutput } = await import("../src/services/llm-service.js");
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    }) as Response) as typeof fetch;

  try {
    const output = await withEnv(
      {
        MORPHUI_OPENAI_API_KEY: "test-openai-key",
        MORPHUI_LLM_MODE: "remote",
      },
      async () =>
        generateStructuredOutput({
          system: "system",
          user: "user",
          fallback: () => ({ mode: "fallback" as const }),
        }),
    );

    assert.deepEqual(output, { mode: "fallback" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back when remote LLM returns invalid JSON payload", async () => {
  const { generateStructuredOutput } = await import("../src/services/llm-service.js");
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not-json" } }],
      }),
    }) as Response) as typeof fetch;

  try {
    const output = await withEnv(
      {
        MORPHUI_OPENAI_API_KEY: "test-openai-key",
        MORPHUI_LLM_MODE: "remote",
      },
      async () =>
        generateStructuredOutput({
          system: "system",
          user: "user",
          fallback: () => ({ mode: "fallback" as const }),
        }),
    );

    assert.deepEqual(output, { mode: "fallback" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parses fenced JSON from remote LLM output", async () => {
  const { generateStructuredOutput } = await import("../src/services/llm-service.js");
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "```json\n{\"provider\":\"gemini\",\"ok\":true}\n```" }],
            },
          },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const output = await withEnv(
      {
        MORPHUI_LLM_MODE: "remote",
        MORPHUI_LLM_PROVIDER: "gemini",
        MORPHUI_GEMINI_API_KEY: "test-gemini-key",
        MORPHUI_GEMINI_MODEL: "gemini-2.5-flash",
        MORPHUI_OPENAI_API_KEY: undefined,
      },
      async () =>
        generateStructuredOutput({
          system: "system",
          user: "user",
          fallback: () => ({ provider: "fallback", ok: false }),
        }),
    );

    assert.deepEqual(output, { provider: "gemini", ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses Claude provider when configured via runtime config", async () => {
  const {
    generateStructuredOutput,
    resetRuntimeLlmConfig,
    setRuntimeLlmConfig,
  } = await import("../src/services/llm-service.js");
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    const headers = new Headers(init?.headers);
    capturedHeaders = {
      "x-api-key": headers.get("x-api-key") || "",
      "anthropic-version": headers.get("anthropic-version") || "",
      "content-type": headers.get("content-type") || "",
    };

    return {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "{\"provider\":\"claude\",\"ok\":true}" }],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    resetRuntimeLlmConfig();

    const output = await withEnv(
      {
        MORPHUI_LLM_MODE: "remote",
        MORPHUI_LLM_PROVIDER: undefined,
        MORPHUI_OPENAI_API_KEY: undefined,
        MORPHUI_GEMINI_API_KEY: undefined,
        MORPHUI_CLAUDE_API_KEY: undefined,
      },
      async () => {
        setRuntimeLlmConfig({
          provider: "claude",
          mode: "remote",
          claudeApiKey: "test-claude-key",
          claudeModel: "claude-3-5-sonnet-latest",
        });
        return generateStructuredOutput({
          system: "system-prompt",
          user: "user-prompt",
          fallback: () => ({ provider: "fallback", ok: false }),
        });
      },
    );

    assert.deepEqual(output, { provider: "claude", ok: true });
    assert.match(capturedUrl, /api\.anthropic\.com\/v1\/messages/);
    assert.equal(capturedHeaders["x-api-key"], "test-claude-key");
    assert.equal(capturedHeaders["anthropic-version"], "2023-06-01");
    assert.equal(capturedHeaders["content-type"], "application/json");
  } finally {
    resetRuntimeLlmConfig();
    globalThis.fetch = originalFetch;
  }
});
