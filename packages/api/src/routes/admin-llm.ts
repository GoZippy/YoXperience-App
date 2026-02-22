import { Router } from "express";
import {
  generatePostExperimentSummary,
  generateRootCauseAnalysis,
} from "../services/recommendation-service.js";
import type {
  LlmModePreference,
  LlmProviderPreference,
} from "../services/llm-service.js";
import { getRuntimeLlmConfig, setRuntimeLlmConfig } from "../services/llm-service.js";
import {
  parseOptionalIsoDate,
  parseRequiredObject,
  parseRequiredString,
} from "../utils/parsers.js";
import { ValidationError } from "../utils/errors.js";

const router = Router();

router.get("/llm/config", (_req, res) => {
  res.json(getRuntimeLlmConfig());
});

router.post("/llm/config", (req, res, next) => {
  try {
    const body = parseRequiredObject(req.body, "body");
    const config = setRuntimeLlmConfig({
      provider: parseProviderPreference(body.provider),
      mode: parseModePreference(body.mode),
      openaiApiKey: parseOptionalConfigText(body.openaiApiKey, "openaiApiKey", 800),
      geminiApiKey: parseOptionalConfigText(body.geminiApiKey, "geminiApiKey", 800),
      claudeApiKey: parseOptionalConfigText(body.claudeApiKey, "claudeApiKey", 800),
      openaiModel: parseOptionalConfigText(body.openaiModel, "openaiModel", 160),
      geminiModel: parseOptionalConfigText(body.geminiModel, "geminiModel", 160),
      claudeModel: parseOptionalConfigText(body.claudeModel, "claudeModel", 160),
    });
    res.json(config);
  } catch (error) {
    next(error);
  }
});

router.post("/llm/root-cause", async (req, res, next) => {
  try {
    const body = parseRequiredObject(req.body, "body");
    const issueTitle = parseRequiredString(body.issueTitle, "issueTitle", 200);
    if (!Array.isArray(body.observedSymptoms) || body.observedSymptoms.length === 0) {
      throw new ValidationError("observedSymptoms must be a non-empty array.");
    }
    const observedSymptoms = body.observedSymptoms.map((item, idx) =>
      parseRequiredString(item, `observedSymptoms[${idx}]`, 300),
    );

    const result = await generateRootCauseAnalysis({
      issueTitle,
      observedSymptoms,
      window:
        body.window && typeof body.window === "object"
          ? {
              from: parseOptionalIsoDate(
                (body.window as { from?: unknown }).from,
                "window.from",
              ),
              to: parseOptionalIsoDate(
                (body.window as { to?: unknown }).to,
                "window.to",
              ),
            }
          : undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/llm/post-experiment-summary", async (req, res, next) => {
  try {
    const body = parseRequiredObject(req.body, "body");
    const experimentId = parseRequiredString(body.experimentId, "experimentId", 120);
    const notes =
      body.notes === undefined ? undefined : parseRequiredString(body.notes, "notes", 4000);
    const result = await generatePostExperimentSummary({
      experimentId,
      notes,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

function parseProviderPreference(value: unknown): LlmProviderPreference | undefined {
  if (value === undefined) return undefined;
  const parsed = parseRequiredString(value, "provider", 20).trim().toLowerCase();
  if (
    parsed === "auto" ||
    parsed === "openai" ||
    parsed === "gemini" ||
    parsed === "claude"
  ) {
    return parsed;
  }
  throw new ValidationError("provider must be one of auto|openai|gemini|claude.");
}

function parseModePreference(value: unknown): LlmModePreference | undefined {
  if (value === undefined) return undefined;
  const parsed = parseRequiredString(value, "mode", 20).trim().toLowerCase();
  if (parsed === "env" || parsed === "remote" || parsed === "heuristic") {
    return parsed;
  }
  throw new ValidationError("mode must be one of env|remote|heuristic.");
}

function parseOptionalConfigText(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "";
  return parseRequiredString(value, fieldName, maxLength);
}

export default router;
