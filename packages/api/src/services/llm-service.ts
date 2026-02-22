interface LlmCallOptions<T> {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  fallback: () => T;
}

export type LlmProvider = "openai" | "gemini" | "claude";
export type LlmProviderPreference = LlmProvider | "auto";
export type LlmModePreference = "env" | "remote" | "heuristic";

export interface RuntimeLlmConfigInput {
  provider?: LlmProviderPreference;
  mode?: LlmModePreference;
  openaiApiKey?: string;
  geminiApiKey?: string;
  claudeApiKey?: string;
  openaiModel?: string;
  geminiModel?: string;
  claudeModel?: string;
}

export interface RuntimeLlmConfigSnapshot {
  providerPreference: LlmProviderPreference;
  modePreference: LlmModePreference;
  activeProvider: LlmProvider | "none";
  remoteEligible: boolean;
  keysConfigured: {
    openai: boolean;
    gemini: boolean;
    claude: boolean;
  };
  models: {
    openai: string;
    gemini: string;
    claude: string;
  };
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string | null;
      }>;
    };
  }>;
}

interface ClaudeMessagesResponse {
  content?: Array<{
    type?: string;
    text?: string | null;
  }>;
}

interface RemoteLlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

interface RuntimeLlmState {
  providerPreference: LlmProviderPreference;
  modePreference: LlmModePreference;
  openaiApiKey: string;
  geminiApiKey: string;
  claudeApiKey: string;
  openaiModel: string;
  geminiModel: string;
  claudeModel: string;
}

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_CLAUDE_MODEL = "claude-3-5-sonnet-latest";

let runtimeState: RuntimeLlmState = {
  providerPreference: "auto",
  modePreference: "env",
  openaiApiKey: "",
  geminiApiKey: "",
  claudeApiKey: "",
  openaiModel: "",
  geminiModel: "",
  claudeModel: "",
};

export function setRuntimeLlmConfig(
  input: RuntimeLlmConfigInput,
): RuntimeLlmConfigSnapshot {
  if (input.provider !== undefined) {
    runtimeState.providerPreference = normalizeProviderPreference(input.provider);
  }
  if (input.mode !== undefined) {
    runtimeState.modePreference = normalizeModePreference(input.mode);
  }
  if (input.openaiApiKey !== undefined) {
    runtimeState.openaiApiKey = sanitizeRuntimeValue(input.openaiApiKey, 800);
  }
  if (input.geminiApiKey !== undefined) {
    runtimeState.geminiApiKey = sanitizeRuntimeValue(input.geminiApiKey, 800);
  }
  if (input.claudeApiKey !== undefined) {
    runtimeState.claudeApiKey = sanitizeRuntimeValue(input.claudeApiKey, 800);
  }
  if (input.openaiModel !== undefined) {
    runtimeState.openaiModel = sanitizeRuntimeValue(input.openaiModel, 160);
  }
  if (input.geminiModel !== undefined) {
    runtimeState.geminiModel = sanitizeRuntimeValue(input.geminiModel, 160);
  }
  if (input.claudeModel !== undefined) {
    runtimeState.claudeModel = sanitizeRuntimeValue(input.claudeModel, 160);
  }
  return getRuntimeLlmConfig();
}

export function resetRuntimeLlmConfig(): void {
  runtimeState = {
    providerPreference: "auto",
    modePreference: "env",
    openaiApiKey: "",
    geminiApiKey: "",
    claudeApiKey: "",
    openaiModel: "",
    geminiModel: "",
    claudeModel: "",
  };
}

export function getRuntimeLlmConfig(): RuntimeLlmConfigSnapshot {
  return {
    providerPreference: runtimeState.providerPreference,
    modePreference: runtimeState.modePreference,
    activeProvider: getResolvedLlmProviderLabel(),
    remoteEligible: canUseRemoteLlm() && !isHeuristicLlmMode(),
    keysConfigured: {
      openai: Boolean(resolveOpenAIApiKey()),
      gemini: Boolean(resolveGeminiApiKey()),
      claude: Boolean(resolveClaudeApiKey()),
    },
    models: {
      openai: resolveOpenAiModel(),
      gemini: resolveGeminiModel(),
      claude: resolveClaudeModel(),
    },
  };
}

export function canUseRemoteLlm(): boolean {
  return Boolean(resolveRemoteLlmConfig());
}

export function isHeuristicLlmMode(): boolean {
  return resolveLlmMode() === "heuristic";
}

export function getResolvedLlmProviderLabel(): LlmProvider | "none" {
  return resolveRemoteLlmConfig()?.provider ?? "none";
}

export async function generateStructuredOutput<T>(
  options: LlmCallOptions<T>,
): Promise<T> {
  const remoteConfig = resolveRemoteLlmConfig(options.model);
  if (isHeuristicLlmMode() || !remoteConfig) {
    return options.fallback();
  }

  try {
    let content = "";
    if (remoteConfig.provider === "openai") {
      content = await requestOpenAi(options, remoteConfig);
    } else if (remoteConfig.provider === "gemini") {
      content = await requestGemini(options, remoteConfig);
    } else {
      content = await requestClaude(options, remoteConfig);
    }

    if (!content) {
      throw new Error("LLM response did not include JSON content.");
    }
    return parseJsonObject<T>(content);
  } catch (error) {
    console.warn(
      `Remote ${remoteConfig.provider} request failed; using heuristic fallback.`,
      error instanceof Error ? error.message : String(error),
    );
    return options.fallback();
  }
}

function resolveLlmMode(): "remote" | "heuristic" {
  if (runtimeState.modePreference === "remote") return "remote";
  if (runtimeState.modePreference === "heuristic") return "heuristic";
  return (process.env.MORPHUI_LLM_MODE || "").trim().toLowerCase() === "heuristic"
    ? "heuristic"
    : "remote";
}

function resolveRemoteLlmConfig(modelOverride?: string): RemoteLlmConfig | null {
  const providerPref = resolveProviderPreference();
  const openAiKey = resolveOpenAIApiKey();
  const geminiKey = resolveGeminiApiKey();
  const claudeKey = resolveClaudeApiKey();

  if (providerPref === "openai") {
    if (!openAiKey) return null;
    return {
      provider: "openai",
      apiKey: openAiKey,
      model: modelOverride || resolveOpenAiModel(),
    };
  }

  if (providerPref === "gemini") {
    if (!geminiKey) return null;
    return {
      provider: "gemini",
      apiKey: geminiKey,
      model: modelOverride || resolveGeminiModel(),
    };
  }

  if (providerPref === "claude") {
    if (!claudeKey) return null;
    return {
      provider: "claude",
      apiKey: claudeKey,
      model: modelOverride || resolveClaudeModel(),
    };
  }

  if (openAiKey) {
    return {
      provider: "openai",
      apiKey: openAiKey,
      model: modelOverride || resolveOpenAiModel(),
    };
  }
  if (geminiKey) {
    return {
      provider: "gemini",
      apiKey: geminiKey,
      model: modelOverride || resolveGeminiModel(),
    };
  }
  if (claudeKey) {
    return {
      provider: "claude",
      apiKey: claudeKey,
      model: modelOverride || resolveClaudeModel(),
    };
  }

  return null;
}

function resolveProviderPreference(): LlmProviderPreference {
  if (runtimeState.providerPreference !== "auto") {
    return runtimeState.providerPreference;
  }

  const envProvider = normalizeProvider(process.env.MORPHUI_LLM_PROVIDER);
  return envProvider ?? "auto";
}

function normalizeProviderPreference(value: string): LlmProviderPreference {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "auto" ||
    normalized === "openai" ||
    normalized === "gemini" ||
    normalized === "claude"
  ) {
    return normalized;
  }
  return "auto";
}

function normalizeModePreference(value: string): LlmModePreference {
  const normalized = value.trim().toLowerCase();
  if (normalized === "env" || normalized === "remote" || normalized === "heuristic") {
    return normalized;
  }
  return "env";
}

function sanitizeRuntimeValue(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function resolveOpenAIApiKey(): string | null {
  const runtimeKey = runtimeState.openaiApiKey.trim();
  if (runtimeKey) return runtimeKey;
  const envKey = process.env.MORPHUI_OPENAI_API_KEY;
  return envKey ? envKey.trim() : null;
}

function resolveGeminiApiKey(): string | null {
  const runtimeKey = runtimeState.geminiApiKey.trim();
  if (runtimeKey) return runtimeKey;
  const envKey = process.env.MORPHUI_GEMINI_API_KEY;
  return envKey ? envKey.trim() : null;
}

function resolveClaudeApiKey(): string | null {
  const runtimeKey = runtimeState.claudeApiKey.trim();
  if (runtimeKey) return runtimeKey;
  const envKey = process.env.MORPHUI_CLAUDE_API_KEY;
  return envKey ? envKey.trim() : null;
}

function resolveOpenAiModel(): string {
  const runtimeModel = runtimeState.openaiModel.trim();
  if (runtimeModel) return runtimeModel;
  const envModel = (process.env.MORPHUI_OPENAI_MODEL || "").trim();
  return envModel || DEFAULT_OPENAI_MODEL;
}

function resolveGeminiModel(): string {
  const runtimeModel = runtimeState.geminiModel.trim();
  if (runtimeModel) return runtimeModel;
  const envModel = (process.env.MORPHUI_GEMINI_MODEL || "").trim();
  return envModel || DEFAULT_GEMINI_MODEL;
}

function resolveClaudeModel(): string {
  const runtimeModel = runtimeState.claudeModel.trim();
  if (runtimeModel) return runtimeModel;
  const envModel = (process.env.MORPHUI_CLAUDE_MODEL || "").trim();
  return envModel || DEFAULT_CLAUDE_MODEL;
}

function normalizeProvider(value: string | undefined): LlmProvider | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai" || normalized === "gemini" || normalized === "claude") {
    return normalized;
  }
  return null;
}

async function requestOpenAi<T>(
  options: LlmCallOptions<T>,
  config: RemoteLlmConfig,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: options.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
    }),
  });

  if (!response.ok) {
    const details = await safeReadBody(response);
    throw new Error(`LLM request failed: HTTP ${response.status} ${details}`);
  }

  const payload = (await response.json()) as OpenAIChatCompletionResponse;
  return payload.choices?.[0]?.message?.content?.trim() || "";
}

async function requestGemini<T>(
  options: LlmCallOptions<T>,
  config: RemoteLlmConfig,
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: options.system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: options.user }],
          },
        ],
        generationConfig: {
          temperature: options.temperature ?? 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const details = await safeReadBody(response);
    throw new Error(`LLM request failed: HTTP ${response.status} ${details}`);
  }

  const payload = (await response.json()) as GeminiGenerateContentResponse;
  const parts = payload.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

async function requestClaude<T>(
  options: LlmCallOptions<T>,
  config: RemoteLlmConfig,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      system: options.system,
      messages: [{ role: "user", content: options.user }],
      temperature: options.temperature ?? 0.2,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const details = await safeReadBody(response);
    throw new Error(`LLM request failed: HTTP ${response.status} ${details}`);
  }

  const payload = (await response.json()) as ClaudeMessagesResponse;
  const parts = payload.content || [];
  return parts
    .filter((part) => part.type === "text")
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function parseJsonObject<T>(content: string): T {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim()) as T;
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
    }

    throw new Error("LLM response did not contain a parseable JSON object.");
  }
}
