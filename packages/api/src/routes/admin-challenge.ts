import { Router } from "express";
import {
  getChallengeAdminControl,
  resetChallengeAdminControl,
  setChallengeAdminControl,
  type ChallengeLayoutStyle,
} from "../services/workflow-challenge-service.js";
import { ValidationError } from "../utils/errors.js";
import { parseRequiredObject, parseRequiredString } from "../utils/parsers.js";

const router = Router();

router.get("/challenge/control", (_req, res) => {
  res.json(getChallengeAdminControl());
});

router.post("/challenge/control", (req, res, next) => {
  try {
    const body = parseRequiredObject(req.body, "body");
    const updated = setChallengeAdminControl({
      enabled: parseOptionalBoolean(body.enabled, "enabled"),
      layoutStyle: parseOptionalLayoutStyle(body.layoutStyle),
      hideDecoys: parseOptionalNullableBoolean(body.hideDecoys, "hideDecoys"),
      showConnectors: parseOptionalNullableBoolean(body.showConnectors, "showConnectors"),
      showSidebarHints: parseOptionalNullableBoolean(
        body.showSidebarHints,
        "showSidebarHints",
      ),
      spotlightNextStep: parseOptionalNullableBoolean(
        body.spotlightNextStep,
        "spotlightNextStep",
      ),
      nextRunMessage: parseOptionalNullableString(body.nextRunMessage, "nextRunMessage", 240),
      rationale: parseOptionalNullableString(body.rationale, "rationale", 320),
      emphasizeStepIds: parseOptionalNullableStepIds(body.emphasizeStepIds),
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post("/challenge/control/reset", (_req, res) => {
  res.json(resetChallengeAdminControl());
});

function parseOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ValidationError(`${fieldName} must be a boolean.`);
  }
  return value;
}

function parseOptionalNullableBoolean(
  value: unknown,
  fieldName: string,
): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "boolean") {
    throw new ValidationError(`${fieldName} must be boolean|null.`);
  }
  return value;
}

function parseOptionalNullableString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseRequiredString(value, fieldName, maxLength);
}

function parseOptionalLayoutStyle(
  value: unknown,
): ChallengeLayoutStyle | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = parseRequiredString(value, "layoutStyle", 20).trim().toLowerCase();
  if (parsed === "busy" || parsed === "guided" || parsed === "focus") {
    return parsed;
  }
  throw new ValidationError("layoutStyle must be one of busy|guided|focus|null.");
}

function parseOptionalNullableStepIds(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) {
    throw new ValidationError("emphasizeStepIds must be an array of strings or null.");
  }
  return value
    .map((item, index) => parseRequiredString(item, `emphasizeStepIds[${index}]`, 80))
    .filter(Boolean)
    .slice(0, 3);
}

export default router;
