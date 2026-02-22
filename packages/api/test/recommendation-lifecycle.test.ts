import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { HttpError } from "../src/utils/errors.js";
import { initTestDb, resetDb } from "./helpers/test-db.js";

async function seedRecommendation(status = "draft"): Promise<string> {
  const { db, recommendationRuns, recommendations } = await initTestDb();
  const runId = "rrun_test_001";
  const recommendationId = "rec_test_001";

  db.insert(recommendationRuns)
    .values({
      id: runId,
      triggerType: "manual",
      status: "completed",
      slotKeys: JSON.stringify(["hero-banner"]),
      segmentKeys: JSON.stringify(["all-users"]),
      windowFrom: "2026-02-01T00:00:00.000Z",
      windowTo: "2026-02-02T00:00:00.000Z",
      startedAt: "2026-02-02T00:00:00.000Z",
      finishedAt: "2026-02-02T00:01:00.000Z",
    })
    .run();

  db.insert(recommendations)
    .values({
      id: recommendationId,
      runId,
      slotKey: "hero-banner",
      segmentKey: "all-users",
      currentVariant: "minimal",
      recommendedVariant: "image-heavy",
      expectedImpact: JSON.stringify({ ctrDelta: 0.01 }),
      confidence: 0.62,
      riskLevel: "medium",
      rationaleText: "Improve visual hierarchy for stronger CTA attention.",
      experimentPlan: JSON.stringify({ rolloutPercent: 20, durationDays: 14 }),
      status,
      createdAt: "2026-02-02T00:00:00.000Z",
    })
    .run();

  return recommendationId;
}

test("approving a draft recommendation moves it to running and starts an experiment", async () => {
  await initTestDb();
  await resetDb();
  const recommendationId = await seedRecommendation("draft");
  const { db, recommendations, experiments } = await initTestDb();
  const { approveRecommendation } = await import("../src/services/recommendation-service.js");

  const result = approveRecommendation({
    recommendationId,
    approvedBy: "qa-admin",
    rolloutPercent: 25,
    durationDays: 10,
  });

  assert.ok(result);
  assert.equal(result.status, "running");

  const recommendation = db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, recommendationId))
    .get();
  assert.ok(recommendation);
  assert.equal(recommendation.status, "running");
  assert.equal(recommendation.approvedBy, "qa-admin");

  const experiment = db
    .select()
    .from(experiments)
    .where(eq(experiments.recommendationId, recommendationId))
    .get();
  assert.ok(experiment);
  assert.equal(experiment.status, "running");
  assert.equal(experiment.rolloutPercent, 25);
});

test("running recommendations cannot be rejected", async () => {
  await initTestDb();
  await resetDb();
  const recommendationId = await seedRecommendation("draft");
  const { approveRecommendation, rejectRecommendation } = await import(
    "../src/services/recommendation-service.js"
  );

  approveRecommendation({
    recommendationId,
    approvedBy: "qa-admin",
    rolloutPercent: 20,
    durationDays: 14,
  });

  assert.throws(
    () =>
      rejectRecommendation({
        recommendationId,
        rejectedBy: "qa-admin",
        reason: "No longer needed",
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === "RECOMMENDATION_STATE_CONFLICT",
  );
});

test("stopping a running experiment also marks the recommendation as stopped", async () => {
  await initTestDb();
  await resetDb();
  const recommendationId = await seedRecommendation("draft");
  const { db, experiments, recommendations } = await initTestDb();
  const { approveRecommendation, stopExperiment } = await import(
    "../src/services/recommendation-service.js"
  );

  const approveResult = approveRecommendation({
    recommendationId,
    approvedBy: "qa-admin",
    rolloutPercent: 35,
    durationDays: 14,
  });
  assert.ok(approveResult);

  const stopResult = stopExperiment({
    experimentId: approveResult.experimentId,
    reason: "Quality guardrail breach",
  });
  assert.ok(stopResult);
  assert.equal(stopResult.status, "stopped");

  const experiment = db
    .select()
    .from(experiments)
    .where(eq(experiments.id, approveResult.experimentId))
    .get();
  assert.ok(experiment);
  assert.equal(experiment.status, "stopped");
  assert.equal(experiment.stopReason, "Quality guardrail breach");

  const recommendation = db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, recommendationId))
    .get();
  assert.ok(recommendation);
  assert.equal(recommendation.status, "stopped");
});

test("post-experiment summary returns 404 when experiment does not exist", async () => {
  await initTestDb();
  await resetDb();
  const { generatePostExperimentSummary } = await import(
    "../src/services/recommendation-service.js"
  );

  await assert.rejects(
    () => generatePostExperimentSummary({ experimentId: "exp_missing_001" }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 404 &&
      error.code === "EXPERIMENT_NOT_FOUND",
  );
});
