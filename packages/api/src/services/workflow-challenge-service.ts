import {
  canUseRemoteLlm,
  generateStructuredOutput,
  getResolvedLlmProviderLabel,
  isHeuristicLlmMode,
} from "./llm-service.js";

export type ChallengeLayoutStyle = "busy" | "guided" | "focus";

export interface ChallengeStepInput {
  stepId: string;
  label: string;
  durationMs: number;
  wrongClicks: number;
}

export interface ChallengeRunInput {
  workflowName: string;
  runNumber: number;
  totalDurationMs: number;
  totalWrongClicks: number;
  decoyClicks: number;
  steps: ChallengeStepInput[];
  previousPlan?: Partial<ChallengeAdaptationPlan> | null;
}

interface ChallengeLlmOutput {
  plan: {
    layoutStyle: ChallengeLayoutStyle;
    emphasizeStepIds: string[];
    hideDecoys: boolean;
    showConnectors: boolean;
    showSidebarHints: boolean;
    spotlightNextStep: boolean;
    nextRunMessage: string;
    rationale: string;
  };
}

export interface ChallengeAdaptationPlan {
  layoutStyle: ChallengeLayoutStyle;
  emphasizeStepIds: string[];
  hideDecoys: boolean;
  showConnectors: boolean;
  showSidebarHints: boolean;
  spotlightNextStep: boolean;
  nextRunMessage: string;
  rationale: string;
}

export interface ChallengeAdaptationResult {
  plan: ChallengeAdaptationPlan;
  meta: {
    strategy: "remote-or-fallback";
    remoteEligible: boolean;
    provider: "openai" | "gemini" | "claude" | "none";
    executionMode: "remote" | "fallback";
    adminOverrideApplied: boolean;
    generatedAt: string;
  };
}

export interface ChallengeAdminControlSnapshot {
  enabled: boolean;
  layoutStyle: ChallengeLayoutStyle | null;
  hideDecoys: boolean | null;
  showConnectors: boolean | null;
  showSidebarHints: boolean | null;
  spotlightNextStep: boolean | null;
  nextRunMessage: string | null;
  rationale: string | null;
  emphasizeStepIds: string[] | null;
}

export interface ChallengeAdminControlUpdate {
  enabled?: boolean;
  layoutStyle?: ChallengeLayoutStyle | null;
  hideDecoys?: boolean | null;
  showConnectors?: boolean | null;
  showSidebarHints?: boolean | null;
  spotlightNextStep?: boolean | null;
  nextRunMessage?: string | null;
  rationale?: string | null;
  emphasizeStepIds?: string[] | null;
}

const DEFAULT_CHALLENGE_ADMIN_CONTROL: ChallengeAdminControlSnapshot = {
  enabled: false,
  layoutStyle: null,
  hideDecoys: null,
  showConnectors: null,
  showSidebarHints: null,
  spotlightNextStep: null,
  nextRunMessage: null,
  rationale: null,
  emphasizeStepIds: null,
};

let challengeAdminControl: ChallengeAdminControlSnapshot = {
  ...DEFAULT_CHALLENGE_ADMIN_CONTROL,
};

export async function generateChallengeAdaptation(
  input: ChallengeRunInput,
): Promise<ChallengeAdaptationResult> {
  const remoteEligible = canUseRemoteLlm() && !isHeuristicLlmMode();
  let usedFallback = false;
  const output = await generateStructuredOutput<ChallengeLlmOutput>({
    system:
      "You optimize onboarding UX from real behavioral telemetry. Return JSON only. " +
      "Choose one layoutStyle from busy|guided|focus. " +
      "Prefer guided/focus when users struggle with ordering or distraction.",
    user: JSON.stringify(
      {
        task: "Optimize the next run UI for a workflow challenge.",
        telemetry: input,
        constraints: {
          allowedLayoutStyles: ["busy", "guided", "focus"],
          maxEmphasizedSteps: 3,
          keepWorkflowOrder: true,
        },
      },
      null,
      2,
    ),
    fallback: () => {
      usedFallback = true;
      return {
        plan: heuristicPlan(input),
      };
    },
  });

  const sanitizedPlan = sanitizePlan(output.plan, input);
  const basePlan = enforceDemoProgression(sanitizedPlan, input);
  const { plan, applied: adminOverrideApplied } = applyAdminControl(basePlan, input);

  return {
    plan,
    meta: {
      strategy: "remote-or-fallback",
      remoteEligible,
      provider: getResolvedLlmProviderLabel(),
      executionMode: usedFallback ? "fallback" : "remote",
      adminOverrideApplied,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function getChallengeAdminControl(): ChallengeAdminControlSnapshot {
  return {
    ...challengeAdminControl,
    emphasizeStepIds: challengeAdminControl.emphasizeStepIds
      ? [...challengeAdminControl.emphasizeStepIds]
      : null,
  };
}

export function setChallengeAdminControl(
  input: ChallengeAdminControlUpdate,
): ChallengeAdminControlSnapshot {
  if (input.enabled !== undefined) {
    challengeAdminControl.enabled = input.enabled;
  }
  if (input.layoutStyle !== undefined) {
    challengeAdminControl.layoutStyle = input.layoutStyle;
  }
  if (input.hideDecoys !== undefined) {
    challengeAdminControl.hideDecoys = input.hideDecoys;
  }
  if (input.showConnectors !== undefined) {
    challengeAdminControl.showConnectors = input.showConnectors;
  }
  if (input.showSidebarHints !== undefined) {
    challengeAdminControl.showSidebarHints = input.showSidebarHints;
  }
  if (input.spotlightNextStep !== undefined) {
    challengeAdminControl.spotlightNextStep = input.spotlightNextStep;
  }
  if (input.nextRunMessage !== undefined) {
    challengeAdminControl.nextRunMessage = sanitizeOptionalText(input.nextRunMessage, 240);
  }
  if (input.rationale !== undefined) {
    challengeAdminControl.rationale = sanitizeOptionalText(input.rationale, 320);
  }
  if (input.emphasizeStepIds !== undefined) {
    challengeAdminControl.emphasizeStepIds = input.emphasizeStepIds
      ? [...input.emphasizeStepIds]
      : null;
  }
  return getChallengeAdminControl();
}

export function resetChallengeAdminControl(): ChallengeAdminControlSnapshot {
  challengeAdminControl = {
    ...DEFAULT_CHALLENGE_ADMIN_CONTROL,
  };
  return getChallengeAdminControl();
}

function heuristicPlan(input: ChallengeRunInput): ChallengeAdaptationPlan {
  const highFrictionSteps = [...input.steps]
    .sort(
      (a, b) =>
        frictionScore(b.durationMs, b.wrongClicks) - frictionScore(a.durationMs, a.wrongClicks),
    )
    .slice(0, 2)
    .map((step) => step.stepId);

  const stressScore =
    input.totalWrongClicks * 1.2 +
    input.decoyClicks * 0.8 +
    Math.max(0, input.totalDurationMs - 35_000) / 8_000;
  const layoutStyle: ChallengeLayoutStyle =
    input.runNumber <= 1
      ? "busy"
      : stressScore >= 10
        ? "focus"
        : "guided";

  return {
    layoutStyle,
    emphasizeStepIds: highFrictionSteps,
    hideDecoys: layoutStyle !== "busy",
    showConnectors: layoutStyle !== "busy",
    showSidebarHints: true,
    spotlightNextStep: layoutStyle !== "busy",
    nextRunMessage:
      layoutStyle === "focus"
        ? "We reduced noise and spotlighted your next action. Try the path again."
        : "We clarified the path and highlighted friction points. Try a faster second run.",
    rationale:
      "Heuristic adaptation based on wrong-click pressure, decoy distraction, and step timing.",
  };
}

function enforceDemoProgression(
  plan: ChallengeAdaptationPlan,
  input: ChallengeRunInput,
): ChallengeAdaptationPlan {
  const friction = input.totalWrongClicks + input.decoyClicks;
  const highStress = friction >= 8 || input.totalDurationMs >= 60_000;
  // Make adaptation visually obvious in demos: after run 1, always reduce clutter.
  const shouldEase =
    input.runNumber >= 1 || friction >= 3 || input.totalDurationMs >= 35_000;

  let layoutStyle = plan.layoutStyle;
  if (highStress) {
    layoutStyle = "focus";
  } else if (shouldEase && layoutStyle === "busy") {
    layoutStyle = "guided";
  }

  const fallbackEmphasis = heuristicPlan(input).emphasizeStepIds;
  const emphasizeStepIds =
    plan.emphasizeStepIds.length > 0
      ? plan.emphasizeStepIds.slice(0, 3)
      : fallbackEmphasis.slice(0, 3);

  if (layoutStyle === "busy") {
    return {
      ...plan,
      emphasizeStepIds,
    };
  }

  return {
    ...plan,
    layoutStyle,
    emphasizeStepIds,
    hideDecoys: true,
    showConnectors: true,
    showSidebarHints: true,
    spotlightNextStep: true,
  };
}

function sanitizePlan(
  plan: Partial<ChallengeAdaptationPlan> | undefined,
  input: ChallengeRunInput,
): ChallengeAdaptationPlan {
  const fallback = heuristicPlan(input);
  const validStepIds = new Set(input.steps.map((step) => step.stepId));
  const layoutStyle =
    plan?.layoutStyle === "busy" || plan?.layoutStyle === "guided" || plan?.layoutStyle === "focus"
      ? plan.layoutStyle
      : fallback.layoutStyle;

  const emphasizeStepIds = Array.isArray(plan?.emphasizeStepIds)
    ? plan.emphasizeStepIds
        .filter((stepId): stepId is string => typeof stepId === "string")
        .filter((stepId) => validStepIds.has(stepId))
        .slice(0, 3)
    : fallback.emphasizeStepIds;

  return {
    layoutStyle,
    emphasizeStepIds,
    hideDecoys:
      typeof plan?.hideDecoys === "boolean"
        ? plan.hideDecoys
        : fallback.hideDecoys,
    showConnectors:
      typeof plan?.showConnectors === "boolean"
        ? plan.showConnectors
        : fallback.showConnectors,
    showSidebarHints:
      typeof plan?.showSidebarHints === "boolean"
        ? plan.showSidebarHints
        : fallback.showSidebarHints,
    spotlightNextStep:
      typeof plan?.spotlightNextStep === "boolean"
        ? plan.spotlightNextStep
        : fallback.spotlightNextStep,
    nextRunMessage:
      typeof plan?.nextRunMessage === "string" && plan.nextRunMessage.trim()
        ? plan.nextRunMessage.trim().slice(0, 240)
        : fallback.nextRunMessage,
    rationale:
      typeof plan?.rationale === "string" && plan.rationale.trim()
        ? plan.rationale.trim().slice(0, 320)
        : fallback.rationale,
  };
}

function applyAdminControl(
  plan: ChallengeAdaptationPlan,
  input: ChallengeRunInput,
): { plan: ChallengeAdaptationPlan; applied: boolean } {
  if (!challengeAdminControl.enabled) {
    return { plan, applied: false };
  }

  let applied = false;
  const nextPlan: ChallengeAdaptationPlan = {
    ...plan,
  };

  if (challengeAdminControl.layoutStyle && nextPlan.layoutStyle !== challengeAdminControl.layoutStyle) {
    nextPlan.layoutStyle = challengeAdminControl.layoutStyle;
    applied = true;
  }
  if (challengeAdminControl.hideDecoys !== null && nextPlan.hideDecoys !== challengeAdminControl.hideDecoys) {
    nextPlan.hideDecoys = challengeAdminControl.hideDecoys;
    applied = true;
  }
  if (
    challengeAdminControl.showConnectors !== null &&
    nextPlan.showConnectors !== challengeAdminControl.showConnectors
  ) {
    nextPlan.showConnectors = challengeAdminControl.showConnectors;
    applied = true;
  }
  if (
    challengeAdminControl.showSidebarHints !== null &&
    nextPlan.showSidebarHints !== challengeAdminControl.showSidebarHints
  ) {
    nextPlan.showSidebarHints = challengeAdminControl.showSidebarHints;
    applied = true;
  }
  if (
    challengeAdminControl.spotlightNextStep !== null &&
    nextPlan.spotlightNextStep !== challengeAdminControl.spotlightNextStep
  ) {
    nextPlan.spotlightNextStep = challengeAdminControl.spotlightNextStep;
    applied = true;
  }
  if (challengeAdminControl.nextRunMessage && nextPlan.nextRunMessage !== challengeAdminControl.nextRunMessage) {
    nextPlan.nextRunMessage = challengeAdminControl.nextRunMessage;
    applied = true;
  }
  if (challengeAdminControl.rationale && nextPlan.rationale !== challengeAdminControl.rationale) {
    nextPlan.rationale = challengeAdminControl.rationale;
    applied = true;
  }

  if (challengeAdminControl.emphasizeStepIds && challengeAdminControl.emphasizeStepIds.length > 0) {
    const validStepIds = new Set(input.steps.map((step) => step.stepId));
    const filtered = challengeAdminControl.emphasizeStepIds
      .filter((stepId) => validStepIds.has(stepId))
      .slice(0, 3);
    if (filtered.length > 0) {
      nextPlan.emphasizeStepIds = filtered;
      applied = true;
    }
  }

  return { plan: nextPlan, applied };
}

function frictionScore(durationMs: number, wrongClicks: number): number {
  return durationMs + wrongClicks * 3_500;
}

function sanitizeOptionalText(value: string | null, maxLength: number): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}
