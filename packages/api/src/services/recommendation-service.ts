import {
  db,
  experiments,
  recommendationCitations,
  recommendationRuns,
  recommendations,
  slotDefinitions,
} from "@morphui/db";
import { and, desc, eq, sql, type InferSelectModel } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  getAnalyticsOverview,
  getCrossSlotInsights,
  getSlotSummaries,
  getSlotVariantSeries,
  resolveWindow,
  type TimeWindow,
} from "./analytics-service.js";
import { isRagEnabled } from "../config/llm.js";
import { generateStructuredOutput } from "./llm-service.js";
import { searchKnowledgeChunks } from "./knowledge-index-service.js";
import { HttpError } from "../utils/errors.js";

export interface GenerateRecommendationsInput {
  slotKeys?: string[];
  segmentKeys?: string[];
  maxRecommendations?: number;
  trigger?: "manual" | "scheduled";
  window?: {
    from?: string | null;
    to?: string | null;
  };
}

type SlotDefinitionRow = InferSelectModel<typeof slotDefinitions>;

interface LlmRecommendationOutput {
  crossSlotInsights: Array<{
    title: string;
    description: string;
  }>;
  segmentHypotheses: Array<{
    segmentKey: string;
    hypothesis: string;
    confidence: number;
  }>;
  experimentIdeas: Array<{
    slotKey: string;
    idea: string;
    rationale: string;
  }>;
  compatibilityRisks: Array<{
    slotKey?: string;
    risk: string;
    mitigation: string;
  }>;
  rootCauseHypotheses: Array<{
    issue: string;
    explanation: string;
    confidence: number;
  }>;
  recommendations: Array<{
    slotKey: string;
    segmentKey: string;
    currentVariant: string;
    recommendedVariant: string;
    confidence: number;
    riskLevel: "low" | "medium" | "high";
    rationale: string;
    expectedImpact?: Record<string, unknown>;
    experimentPlan?: {
      rolloutPercent?: number;
      durationDays?: number;
      guardrails?: string[];
    };
    citations?: Array<{
      sourceType: string;
      sourceRef: string;
      quoteExcerpt?: string;
    }>;
  }>;
}

export interface RecommendationListItem {
  id: string;
  slotKey: string;
  segmentKey: string;
  currentVariant: string;
  recommendedVariant: string;
  confidence: number;
  riskLevel: string;
  status: string;
  createdAt: string;
}

export interface RecommendationDetail {
  id: string;
  slotKey: string;
  segmentKey: string;
  currentVariant: string;
  recommendedVariant: string;
  confidence: number;
  riskLevel: string;
  status: string;
  rationale: string;
  expectedImpact: Record<string, unknown> | null;
  experimentPlan: Record<string, unknown> | null;
  citations: Array<{
    sourceType: string;
    sourceRef: string;
    quoteExcerpt: string | null;
  }>;
  experiment: {
    id: string;
    status: string;
    rolloutPercent: number;
    durationDays: number;
    startedAt: string;
    endAt: string | null;
    resultJson: Record<string, unknown> | null;
  } | null;
}

export interface RootCauseInput {
  issueTitle: string;
  observedSymptoms: string[];
  window?: {
    from?: string | null;
    to?: string | null;
  };
}

export interface RootCauseOutput {
  hypotheses: Array<{
    title: string;
    likelihood: "low" | "medium" | "high";
    analysis: string;
    nextChecks: string[];
  }>;
  immediateActions: string[];
}

export interface PostExperimentSummaryInput {
  experimentId: string;
  notes?: string;
}

export interface PostExperimentSummaryOutput {
  summary: string;
  outcome: "positive" | "neutral" | "negative";
  lessons: string[];
  nextActions: string[];
}

export async function generateRecommendationRun(
  input: GenerateRecommendationsInput,
) {
  const ragEnabled = isRagEnabled();
  const runId = `rrun_${nanoid(12)}`;
  const slotDefs = db.select().from(slotDefinitions).all();
  const slotDefMap = new Map(slotDefs.map((slot) => [slot.slotKey, slot]));

  const window = resolveWindow(input.window?.from, input.window?.to, 14);
  const segments = input.segmentKeys?.length ? input.segmentKeys : ["all-users"];
  const slotFilter =
    input.slotKeys && input.slotKeys.length > 0 ? new Set(input.slotKeys) : null;
  const slotSummaries = getSlotSummaries(window, { limit: 200 }).filter((slot) =>
    slotFilter ? slotFilter.has(slot.slotKey) : true,
  );
  const overview = getAnalyticsOverview(window);
  const crossSlot = getCrossSlotInsights(20);

  const slotInputs = slotSummaries.map((slot) => {
    const variants = parseVariants(slotDefMap.get(slot.slotKey)?.variants ?? "[]");
    const series = getSlotVariantSeries(slot.slotKey, window, { bucket: "day" });
    const evidence = ragEnabled
      ? searchKnowledgeChunks(`${slot.slotKey} ${variants.join(" ")} component behavior`, {
          limit: 4,
        })
      : [];
    return {
      slotKey: slot.slotKey,
      topVariant: slot.topVariant,
      ctr: slot.ctr,
      impressions: slot.impressions,
      clicks: slot.clicks,
      variants,
      series,
      evidence: evidence.map((item) => ({
        sourceType: item.sourceType,
        sourceRef: item.sourcePath,
        excerpt: item.text.slice(0, 260),
      })),
    };
  });

  db.insert(recommendationRuns)
    .values({
      id: runId,
      projectId: "prj_system",
      triggerType: input.trigger || "manual",
      status: "running",
      slotKeys: JSON.stringify(input.slotKeys || []),
      segmentKeys: JSON.stringify(segments),
      windowFrom: window.from,
      windowTo: window.to,
      startedAt: new Date().toISOString(),
    })
    .run();

  try {
    const maxRecommendations = Math.min(Math.max(input.maxRecommendations || 20, 1), 50);
    const llmOutput = await generateStructuredOutput<LlmRecommendationOutput>({
      system:
        "You are a senior experimentation strategist. Return only valid JSON. " +
        "Use telemetry context and any provided evidence excerpts. " +
        "Never recommend variants not present in each slot's allowed variants.",
      user: JSON.stringify(
        {
          task: "Generate UI optimization recommendations and insights",
          constraints: {
            maxRecommendations,
            allowedRiskLevels: ["low", "medium", "high"],
            segments,
            ragEnabled,
          },
          telemetryOverview: overview,
          crossSlotPatterns: crossSlot,
          slots: slotInputs,
        },
        null,
        2,
      ),
      fallback: () =>
        heuristicRecommendationPack({
          slotInputs,
          segments,
          maxRecommendations,
          crossSlot,
        }),
    });

    const sanitized = sanitizeLlmOutput(llmOutput, slotDefMap, segments, maxRecommendations);
    const created = persistRecommendations(runId, sanitized.recommendations);

    db.update(recommendationRuns)
      .set({
        status: "completed",
        finishedAt: new Date().toISOString(),
        summary: JSON.stringify({
          created,
          crossSlotInsights: sanitized.crossSlotInsights.length,
          segmentHypotheses: sanitized.segmentHypotheses.length,
          experimentIdeas: sanitized.experimentIdeas.length,
        }),
      })
      .where(eq(recommendationRuns.id, runId))
      .run();

    return {
      runId,
      created,
      status: "completed",
      crossSlotInsights: sanitized.crossSlotInsights,
      segmentHypotheses: sanitized.segmentHypotheses,
      experimentIdeas: sanitized.experimentIdeas,
      compatibilityRisks: sanitized.compatibilityRisks,
      rootCauseHypotheses: sanitized.rootCauseHypotheses,
    };
  } catch (error) {
    db.update(recommendationRuns)
      .set({
        status: "failed",
        finishedAt: new Date().toISOString(),
        summary: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      })
      .where(eq(recommendationRuns.id, runId))
      .run();
    throw error;
  }
}

export function listRecommendations(options: {
  status?: string;
  slotKey?: string;
  segmentKey?: string;
  limit?: number;
}): RecommendationListItem[] {
  const limit = Math.min(Math.max(options.limit || 50, 1), 200);
  const whereClauses = [];
  if (options.status) whereClauses.push(eq(recommendations.status, options.status));
  if (options.slotKey) whereClauses.push(eq(recommendations.slotKey, options.slotKey));
  if (options.segmentKey) {
    whereClauses.push(eq(recommendations.segmentKey, options.segmentKey));
  }

  const rows = db
    .select({
      id: recommendations.id,
      slotKey: recommendations.slotKey,
      segmentKey: recommendations.segmentKey,
      currentVariant: recommendations.currentVariant,
      recommendedVariant: recommendations.recommendedVariant,
      confidence: recommendations.confidence,
      riskLevel: recommendations.riskLevel,
      status: recommendations.status,
      createdAt: recommendations.createdAt,
    })
    .from(recommendations)
    .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
    .orderBy(desc(recommendations.createdAt))
    .limit(limit)
    .all();

  return rows.map((row) => ({
    ...row,
    confidence: toFiniteNumber(row.confidence),
  }));
}

export function getRecommendationDetail(id: string): RecommendationDetail | null {
  const recommendation = db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, id))
    .get();
  if (!recommendation) return null;

  const citations = db
    .select({
      sourceType: recommendationCitations.sourceType,
      sourceRef: recommendationCitations.sourceRef,
      quoteExcerpt: recommendationCitations.quoteExcerpt,
    })
    .from(recommendationCitations)
    .where(eq(recommendationCitations.recommendationId, id))
    .all();

  const experiment = db
    .select()
    .from(experiments)
    .where(eq(experiments.recommendationId, id))
    .get();

  return {
    id: recommendation.id,
    slotKey: recommendation.slotKey,
    segmentKey: recommendation.segmentKey,
    currentVariant: recommendation.currentVariant,
    recommendedVariant: recommendation.recommendedVariant,
    confidence: toFiniteNumber(recommendation.confidence),
    riskLevel: recommendation.riskLevel,
    status: recommendation.status,
    rationale: recommendation.rationaleText,
    expectedImpact: parseJsonObject(recommendation.expectedImpact),
    experimentPlan: parseJsonObject(recommendation.experimentPlan),
    citations,
    experiment: experiment
      ? {
          id: experiment.id,
          status: experiment.status,
          rolloutPercent: experiment.rolloutPercent,
          durationDays: experiment.durationDays,
          startedAt: experiment.startedAt,
          endAt: experiment.endAt,
          resultJson: parseJsonObject(experiment.resultJson),
        }
      : null,
  };
}

export function approveRecommendation(params: {
  recommendationId: string;
  approvedBy: string;
  rolloutPercent: number;
  durationDays: number;
}) {
  return db.transaction((tx) => {
    const recommendation = tx
      .select()
      .from(recommendations)
      .where(eq(recommendations.id, params.recommendationId))
      .get();
    if (!recommendation) return null;

    if (recommendation.status === "running") {
      throw new HttpError(409, "Recommendation is already running.", {
        code: "RECOMMENDATION_STATE_CONFLICT",
        details: {
          recommendationId: params.recommendationId,
          currentStatus: recommendation.status,
        },
      });
    }

    if (recommendation.status !== "draft" && recommendation.status !== "approved") {
      throw new HttpError(
        409,
        "Recommendation can only be approved from draft or approved state.",
        {
          code: "RECOMMENDATION_STATE_CONFLICT",
          details: {
            recommendationId: params.recommendationId,
            currentStatus: recommendation.status,
          },
        },
      );
    }

    const approvedAt = new Date().toISOString();
    tx.update(recommendations)
      .set({
        status: "running",
        approvedBy: params.approvedBy,
        approvedAt,
        rejectedBy: null,
        rejectedReason: null,
        rejectedAt: null,
      })
      .where(eq(recommendations.id, params.recommendationId))
      .run();

    const experimentId = `exp_${nanoid(12)}`;
    tx.insert(experiments)
      .values({
        id: experimentId,
        recommendationId: params.recommendationId,
        status: "running",
        rolloutPercent: params.rolloutPercent,
        durationDays: params.durationDays,
        startedAt: approvedAt,
        endAt: null,
        stoppedAt: null,
        stopReason: null,
      })
      .onConflictDoUpdate({
        target: experiments.recommendationId,
        set: {
          status: "running",
          rolloutPercent: params.rolloutPercent,
          durationDays: params.durationDays,
          startedAt: approvedAt,
          endAt: null,
          stoppedAt: null,
          stopReason: null,
        },
      })
      .run();

    const experiment = tx
      .select({ id: experiments.id })
      .from(experiments)
      .where(eq(experiments.recommendationId, params.recommendationId))
      .get();

    return {
      recommendationId: params.recommendationId,
      status: "running",
      experimentId: experiment?.id ?? experimentId,
    };
  });
}

export function rejectRecommendation(params: {
  recommendationId: string;
  rejectedBy: string;
  reason: string;
}) {
  return db.transaction((tx) => {
    const recommendation = tx
      .select()
      .from(recommendations)
      .where(eq(recommendations.id, params.recommendationId))
      .get();
    if (!recommendation) return null;

    if (recommendation.status === "running") {
      throw new HttpError(409, "Running recommendations cannot be rejected.", {
        code: "RECOMMENDATION_STATE_CONFLICT",
        details: {
          recommendationId: params.recommendationId,
          currentStatus: recommendation.status,
        },
      });
    }

    if (recommendation.status === "completed" || recommendation.status === "stopped") {
      throw new HttpError(
        409,
        "Completed or stopped recommendations cannot be rejected.",
        {
          code: "RECOMMENDATION_STATE_CONFLICT",
          details: {
            recommendationId: params.recommendationId,
            currentStatus: recommendation.status,
          },
        },
      );
    }

    tx.update(recommendations)
      .set({
        status: "rejected",
        rejectedBy: params.rejectedBy,
        rejectedReason: params.reason,
        rejectedAt: new Date().toISOString(),
      })
      .where(eq(recommendations.id, params.recommendationId))
      .run();

    return {
      recommendationId: params.recommendationId,
      status: "rejected",
    };
  });
}

export function stopExperiment(params: { experimentId: string; reason: string }) {
  return db.transaction((tx) => {
    const experiment = tx
      .select()
      .from(experiments)
      .where(eq(experiments.id, params.experimentId))
      .get();
    if (!experiment) return null;

    if (experiment.status !== "running") {
      throw new HttpError(409, "Only running experiments can be stopped.", {
        code: "EXPERIMENT_STATE_CONFLICT",
        details: {
          experimentId: params.experimentId,
          currentStatus: experiment.status,
        },
      });
    }

    const stoppedAt = new Date().toISOString();
    tx.update(experiments)
      .set({
        status: "stopped",
        stoppedAt,
        endAt: stoppedAt,
        stopReason: params.reason,
      })
      .where(eq(experiments.id, params.experimentId))
      .run();

    tx.update(recommendations)
      .set({
        status: "stopped",
      })
      .where(eq(recommendations.id, experiment.recommendationId))
      .run();

    return {
      experimentId: params.experimentId,
      recommendationId: experiment.recommendationId,
      status: "stopped",
      stoppedAt,
    };
  });
}

export async function generateRootCauseAnalysis(
  input: RootCauseInput,
): Promise<RootCauseOutput> {
  const ragEnabled = isRagEnabled();
  const window = resolveWindow(input.window?.from, input.window?.to, 7);
  const overview = getAnalyticsOverview(window);
  const slots = getSlotSummaries(window, { limit: 25 });
  const evidence = ragEnabled
    ? searchKnowledgeChunks(`${input.issueTitle} ${input.observedSymptoms.join(" ")}`, {
        limit: 8,
      })
    : [];

  const output = await generateStructuredOutput<RootCauseOutput>({
    system:
      "You are a principal incident analyst for adaptive UI systems. Return only JSON.",
    user: JSON.stringify(
      {
        task: "Root-cause analysis for UX metric incident",
        issueTitle: input.issueTitle,
        observedSymptoms: input.observedSymptoms,
        telemetryOverview: overview,
        slotSummaries: slots,
        evidence: evidence.map((item) => ({
          sourcePath: item.sourcePath,
          sourceType: item.sourceType,
          excerpt: item.text.slice(0, 260),
        })),
      },
      null,
      2,
    ),
    fallback: () => heuristicRootCause(input, window),
  });

  return sanitizeRootCauseOutput(output);
}

export async function generatePostExperimentSummary(
  input: PostExperimentSummaryInput,
): Promise<PostExperimentSummaryOutput> {
  const ragEnabled = isRagEnabled();
  const experiment = db
    .select()
    .from(experiments)
    .where(eq(experiments.id, input.experimentId))
    .get();
  if (!experiment) {
    throw new HttpError(404, "Experiment not found.", {
      code: "EXPERIMENT_NOT_FOUND",
      details: { experimentId: input.experimentId },
    });
  }

  const recommendation = db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, experiment.recommendationId))
    .get();
  if (!recommendation) {
    throw new HttpError(404, "Recommendation linked to experiment not found.", {
      code: "RECOMMENDATION_NOT_FOUND",
      details: {
        recommendationId: experiment.recommendationId,
        experimentId: input.experimentId,
      },
    });
  }

  const evidence = ragEnabled
    ? searchKnowledgeChunks(
        `${recommendation.slotKey} ${recommendation.recommendedVariant} experiment outcome`,
        { limit: 6 },
      )
    : [];

  const output = await generateStructuredOutput<PostExperimentSummaryOutput>({
    system:
      "You are a staff experimentation scientist. Return only JSON with concise conclusions.",
    user: JSON.stringify(
      {
        task: "Summarize experiment and propose next steps",
        experiment: {
          id: experiment.id,
          status: experiment.status,
          rolloutPercent: experiment.rolloutPercent,
          durationDays: experiment.durationDays,
          startedAt: experiment.startedAt,
          endAt: experiment.endAt,
          resultJson: parseJsonObject(experiment.resultJson),
        },
        recommendation: {
          slotKey: recommendation.slotKey,
          currentVariant: recommendation.currentVariant,
          recommendedVariant: recommendation.recommendedVariant,
          confidence: recommendation.confidence,
          rationale: recommendation.rationaleText,
          expectedImpact: parseJsonObject(recommendation.expectedImpact),
        },
        notes: input.notes || null,
        evidence: evidence.map((item) => ({
          sourcePath: item.sourcePath,
          excerpt: item.text.slice(0, 220),
        })),
      },
      null,
      2,
    ),
    fallback: () => heuristicExperimentSummary(experiment.status),
  });

  return sanitizePostExperimentOutput(output);
}

function persistRecommendations(
  runId: string,
  recs: LlmRecommendationOutput["recommendations"],
): number {
  let created = 0;
  for (const rec of recs) {
    const recommendationId = `rec_${nanoid(12)}`;
    db.insert(recommendations)
      .values({
        id: recommendationId,
        runId,
        slotKey: rec.slotKey,
        segmentKey: rec.segmentKey,
        currentVariant: rec.currentVariant,
        recommendedVariant: rec.recommendedVariant,
        confidence: clampConfidence(rec.confidence),
        riskLevel: normalizeRisk(rec.riskLevel),
        rationaleText: rec.rationale,
        expectedImpact: rec.expectedImpact
          ? JSON.stringify(rec.expectedImpact)
          : null,
        experimentPlan: rec.experimentPlan ? JSON.stringify(rec.experimentPlan) : null,
        status: "draft",
      })
      .run();

    if (rec.citations && rec.citations.length > 0) {
      db.insert(recommendationCitations)
        .values(
          rec.citations.map((citation) => ({
            id: `cite_${nanoid(12)}`,
            recommendationId,
            sourceType: citation.sourceType,
            sourceRef: citation.sourceRef,
            quoteExcerpt: citation.quoteExcerpt || null,
          })),
        )
        .run();
    }

    created += 1;
  }

  return created;
}

function heuristicRecommendationPack(input: {
  slotInputs: Array<{
    slotKey: string;
    topVariant: string | null;
    variants: string[];
    ctr: number;
    evidence: Array<{
      sourceType: string;
      sourceRef: string;
      excerpt: string;
    }>;
  }>;
  segments: string[];
  maxRecommendations: number;
  crossSlot: Array<{
    slotA: string;
    variantA: string;
    slotB: string;
    variantB: string;
    count: number;
  }>;
}): LlmRecommendationOutput {
  const recommendationsOut: LlmRecommendationOutput["recommendations"] = [];
  for (const slot of input.slotInputs) {
    if (recommendationsOut.length >= input.maxRecommendations) break;
    const currentVariant =
      slot.topVariant && slot.variants.includes(slot.topVariant)
        ? slot.topVariant
        : slot.variants[0] || "unknown";
    const alternative = slot.variants.find((variant) => variant !== currentVariant);
    if (!alternative) continue;

    for (const segment of input.segments) {
      if (recommendationsOut.length >= input.maxRecommendations) break;
      recommendationsOut.push({
        slotKey: slot.slotKey,
        segmentKey: segment,
        currentVariant,
        recommendedVariant: alternative,
        confidence: 0.58,
        riskLevel: "medium",
        rationale:
          "Heuristic recommendation: rotate to the strongest alternative to validate incremental uplift with controlled rollout.",
        expectedImpact: {
          ctrDelta: 0.01,
          confidenceInterval: [0.002, 0.018],
        },
        experimentPlan: {
          rolloutPercent: 20,
          durationDays: 14,
          guardrails: ["error_rate", "bounce_rate", "latency_p95"],
        },
        citations: slot.evidence.slice(0, 2).map((evidence) => ({
          sourceType: evidence.sourceType,
          sourceRef: evidence.sourceRef,
          quoteExcerpt: evidence.excerpt,
        })),
      });
    }
  }

  return {
    crossSlotInsights: input.crossSlot.slice(0, 5).map((pair) => ({
      title: `${pair.slotA}:${pair.variantA} correlates with ${pair.slotB}:${pair.variantB}`,
      description: `Observed together in ${pair.count} user preference profiles.`,
    })),
    segmentHypotheses: input.segments.map((segment) => ({
      segmentKey: segment,
      hypothesis:
        "Segment may respond better to clearer visual hierarchy and explicit call-to-action emphasis.",
      confidence: 0.55,
    })),
    experimentIdeas: recommendationsOut.slice(0, 6).map((rec) => ({
      slotKey: rec.slotKey,
      idea: `Run ${rec.currentVariant} vs ${rec.recommendedVariant} for ${rec.segmentKey}`,
      rationale: "Validate uplift while monitoring quality guardrails.",
    })),
    compatibilityRisks: recommendationsOut.slice(0, 4).map((rec) => ({
      slotKey: rec.slotKey,
      risk: "Potential design inconsistency with adjacent adaptive slots.",
      mitigation: "Validate component compatibility and token usage pre-rollout.",
    })),
    rootCauseHypotheses: [
      {
        issue: "CTR plateau across major slots",
        explanation:
          "Stable preference convergence with low exploration can suppress discovery of better-performing variants.",
        confidence: 0.51,
      },
    ],
    recommendations: recommendationsOut,
  };
}

function sanitizeLlmOutput(
  output: LlmRecommendationOutput,
  slotDefMap: Map<string, SlotDefinitionRow>,
  segments: string[],
  maxRecommendations: number,
): LlmRecommendationOutput {
  const safeRecommendations: LlmRecommendationOutput["recommendations"] = [];
  for (const recommendation of output.recommendations || []) {
    const slotDef = slotDefMap.get(recommendation.slotKey);
    if (!slotDef) continue;

    const variants = parseVariants(slotDef.variants);
    const current = variants.includes(recommendation.currentVariant)
      ? recommendation.currentVariant
      : slotDef.defaultVariant;
    const candidate = variants.includes(recommendation.recommendedVariant)
      ? recommendation.recommendedVariant
      : variants.find((variant) => variant !== current);
    if (!candidate || candidate === current) continue;

    const segmentKey = segments.includes(recommendation.segmentKey)
      ? recommendation.segmentKey
      : segments[0]!;

    safeRecommendations.push({
      slotKey: recommendation.slotKey,
      segmentKey,
      currentVariant: current,
      recommendedVariant: candidate,
      confidence: clampConfidence(recommendation.confidence),
      riskLevel: normalizeRisk(recommendation.riskLevel),
      rationale: (recommendation.rationale || "").trim() || "No rationale provided.",
      expectedImpact: recommendation.expectedImpact || undefined,
      experimentPlan: {
        rolloutPercent: clampInt(recommendation.experimentPlan?.rolloutPercent, 20, 5, 100),
        durationDays: clampInt(recommendation.experimentPlan?.durationDays, 14, 3, 60),
        guardrails:
          recommendation.experimentPlan?.guardrails?.filter(Boolean).slice(0, 8) || [
            "error_rate",
            "bounce_rate",
          ],
      },
      citations: (recommendation.citations || []).slice(0, 6).map((citation) => ({
        sourceType: citation.sourceType || "unknown",
        sourceRef: citation.sourceRef || "unknown",
        quoteExcerpt: citation.quoteExcerpt || undefined,
      })),
    });
  }

  return {
    crossSlotInsights: (output.crossSlotInsights || []).slice(0, 12),
    segmentHypotheses: (output.segmentHypotheses || []).slice(0, 12),
    experimentIdeas: (output.experimentIdeas || []).slice(0, 20),
    compatibilityRisks: (output.compatibilityRisks || []).slice(0, 15),
    rootCauseHypotheses: (output.rootCauseHypotheses || []).slice(0, 12),
    recommendations: safeRecommendations.slice(0, maxRecommendations),
  };
}

function parseVariants(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((variant): variant is string => typeof variant === "string")
      .map((variant) => variant.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function clampConfidence(value: number): number {
  const numeric = toFiniteNumber(value);
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return numeric;
}

function normalizeRisk(value: string): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}

function clampInt(
  value: number | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(numeric)) return defaultValue;
  return Math.max(min, Math.min(max, numeric));
}

function parseJsonObject(input: string | null): Record<string, unknown> | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(input) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toFiniteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
}

function heuristicRootCause(
  input: RootCauseInput,
  window: TimeWindow,
): RootCauseOutput {
  return {
    hypotheses: [
      {
        title: "Variant exploration decayed too quickly",
        likelihood: "medium",
        analysis: `Signals in ${window.from} to ${window.to} suggest dominant variants may have reduced experimentation breadth.`,
        nextChecks: [
          "Compare impression distribution entropy by slot week-over-week.",
          "Inspect low-performing segments for over-converged resolved variants.",
        ],
      },
      {
        title: "Cross-slot interaction mismatch",
        likelihood: "medium",
        analysis:
          "High-performing variants in isolation may conflict when combined across adaptive slots.",
        nextChecks: [
          "Review cross-slot co-occurrence matrix for negative combinations.",
          "Run a paired experiment on top conflicting slot combinations.",
        ],
      },
    ],
    immediateActions: [
      `Open controlled rollback experiment for ${input.issueTitle}.`,
      "Increase monitoring cadence on CTR, dismiss rate, and bounce rate.",
      "Add guardrails to pause high-risk recommendations automatically.",
    ],
  };
}

function sanitizeRootCauseOutput(output: RootCauseOutput): RootCauseOutput {
  const hypotheses = (output.hypotheses || []).slice(0, 8).map((item) => ({
    title: (item.title || "").trim() || "Untitled hypothesis",
    likelihood:
      item.likelihood === "low" || item.likelihood === "medium" || item.likelihood === "high"
        ? item.likelihood
        : "medium",
    analysis: (item.analysis || "").trim() || "No analysis provided.",
    nextChecks: (item.nextChecks || []).filter(Boolean).slice(0, 6),
  }));

  return {
    hypotheses,
    immediateActions: (output.immediateActions || []).filter(Boolean).slice(0, 8),
  };
}

function heuristicExperimentSummary(status: string): PostExperimentSummaryOutput {
  return {
    summary:
      "Experiment completed with usable signal. Recommended variant shows directional impact but requires follow-up validation.",
    outcome: status === "completed" ? "positive" : "neutral",
    lessons: [
      "Slot-level gains depend on compatible neighboring slot variants.",
      "Rollout guardrails prevented quality regressions during test.",
    ],
    nextActions: [
      "Expand winning treatment to a larger segment with staged rollout.",
      "Run follow-up test focused on cross-slot interaction effects.",
    ],
  };
}

function sanitizePostExperimentOutput(
  output: PostExperimentSummaryOutput,
): PostExperimentSummaryOutput {
  const outcome =
    output.outcome === "positive" ||
    output.outcome === "neutral" ||
    output.outcome === "negative"
      ? output.outcome
      : "neutral";

  return {
    summary: (output.summary || "").trim() || "No summary provided.",
    outcome,
    lessons: (output.lessons || []).filter(Boolean).slice(0, 10),
    nextActions: (output.nextActions || []).filter(Boolean).slice(0, 10),
  };
}
