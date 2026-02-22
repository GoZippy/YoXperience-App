import { Router } from "express";
import {
  generateChallengeAdaptation,
  type ChallengeLayoutStyle,
  type ChallengeRunInput,
} from "../services/workflow-challenge-service.js";
import {
  parseRequiredObject,
  parseRequiredString,
} from "../utils/parsers.js";
import { ValidationError } from "../utils/errors.js";

const router = Router();

router.post("/challenge/optimize", async (req, res, next) => {
  try {
    const body = parseRequiredObject(req.body, "body");
    const input: ChallengeRunInput = {
      workflowName: parseRequiredString(body.workflowName, "workflowName", 160),
      runNumber: parsePositiveInt(body.runNumber, "runNumber"),
      totalDurationMs: parseNonNegativeInt(body.totalDurationMs, "totalDurationMs"),
      totalWrongClicks: parseNonNegativeInt(body.totalWrongClicks, "totalWrongClicks"),
      decoyClicks: parseNonNegativeInt(body.decoyClicks, "decoyClicks"),
      steps: parseSteps(body.steps),
      previousPlan: parsePreviousPlan(body.previousPlan),
    };

    const result = await generateChallengeAdaptation(input);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

function parseSteps(value: unknown): ChallengeRunInput["steps"] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError("steps must be a non-empty array.");
  }

  return value.map((item, index) => {
    const record = parseRequiredObject(item, `steps[${index}]`);
    return {
      stepId: parseRequiredString(record.stepId, `steps[${index}].stepId`, 80),
      label: parseRequiredString(record.label, `steps[${index}].label`, 160),
      durationMs: parseNonNegativeInt(record.durationMs, `steps[${index}].durationMs`),
      wrongClicks: parseNonNegativeInt(record.wrongClicks, `steps[${index}].wrongClicks`),
    };
  });
}

function parsePreviousPlan(
  value: unknown,
): ChallengeRunInput["previousPlan"] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const plan = parseRequiredObject(value, "previousPlan");
  const output: Partial<{
    layoutStyle: ChallengeLayoutStyle;
    emphasizeStepIds: string[];
    hideDecoys: boolean;
    showConnectors: boolean;
    showSidebarHints: boolean;
    spotlightNextStep: boolean;
    nextRunMessage: string;
    rationale: string;
  }> = {};

  if (plan.layoutStyle !== undefined) {
    if (
      plan.layoutStyle === "busy" ||
      plan.layoutStyle === "guided" ||
      plan.layoutStyle === "focus"
    ) {
      output.layoutStyle = plan.layoutStyle;
    } else {
      throw new ValidationError(
        "previousPlan.layoutStyle must be one of busy|guided|focus.",
      );
    }
  }

  if (plan.emphasizeStepIds !== undefined) {
    if (!Array.isArray(plan.emphasizeStepIds)) {
      throw new ValidationError("previousPlan.emphasizeStepIds must be an array.");
    }
    output.emphasizeStepIds = plan.emphasizeStepIds.map((value, index) =>
      parseRequiredString(value, `previousPlan.emphasizeStepIds[${index}]`, 80),
    );
  }

  output.hideDecoys = parseOptionalBoolean(plan.hideDecoys, "previousPlan.hideDecoys");
  output.showConnectors = parseOptionalBoolean(
    plan.showConnectors,
    "previousPlan.showConnectors",
  );
  output.showSidebarHints = parseOptionalBoolean(
    plan.showSidebarHints,
    "previousPlan.showSidebarHints",
  );
  output.spotlightNextStep = parseOptionalBoolean(
    plan.spotlightNextStep,
    "previousPlan.spotlightNextStep",
  );

  if (plan.nextRunMessage !== undefined) {
    output.nextRunMessage = parseRequiredString(
      plan.nextRunMessage,
      "previousPlan.nextRunMessage",
      240,
    );
  }
  if (plan.rationale !== undefined) {
    output.rationale = parseRequiredString(
      plan.rationale,
      "previousPlan.rationale",
      320,
    );
  }

  return output;
}

function parsePositiveInt(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInt(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ValidationError(`${fieldName} must be a non-negative integer.`);
  }
  return parsed;
}

function parseOptionalBoolean(
  value: unknown,
  fieldName: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ValidationError(`${fieldName} must be a boolean.`);
  }
  return value;
}

export default router;
