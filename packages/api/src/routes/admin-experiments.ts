import { Router } from "express";
import { db, experiments, recommendations } from "@morphui/db";
import { desc, eq } from "drizzle-orm";
import { parseOptionalPositiveInt, parseRequiredObject, parseRequiredString } from "../utils/parsers.js";
import { stopExperiment } from "../services/recommendation-service.js";

const router = Router();

router.get("/experiments", (req, res, next) => {
  try {
    const limit = parseOptionalPositiveInt(req.query.limit, "limit", 50);
    const items = db
      .select({
        id: experiments.id,
        recommendationId: experiments.recommendationId,
        status: experiments.status,
        rolloutPercent: experiments.rolloutPercent,
        durationDays: experiments.durationDays,
        startedAt: experiments.startedAt,
        endAt: experiments.endAt,
      })
      .from(experiments)
      .orderBy(desc(experiments.startedAt))
      .limit(limit)
      .all();

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get("/experiments/:id", (req, res, next) => {
  try {
    const id = parseRequiredString(req.params.id, "id", 120);
    const item = db
      .select()
      .from(experiments)
      .where(eq(experiments.id, id))
      .get();
    if (!item) {
      res.status(404).json({ error: "Experiment not found" });
      return;
    }

    const recommendation = db
      .select({
        id: recommendations.id,
        slotKey: recommendations.slotKey,
        currentVariant: recommendations.currentVariant,
        recommendedVariant: recommendations.recommendedVariant,
        status: recommendations.status,
      })
      .from(recommendations)
      .where(eq(recommendations.id, item.recommendationId))
      .get();

    res.json({
      id: item.id,
      recommendationId: item.recommendationId,
      status: item.status,
      rolloutPercent: item.rolloutPercent,
      durationDays: item.durationDays,
      startedAt: item.startedAt,
      endAt: item.endAt,
      stoppedAt: item.stoppedAt,
      stopReason: item.stopReason,
      resultJson: item.resultJson ? JSON.parse(item.resultJson) : null,
      recommendation,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/experiments/:id/stop", (req, res, next) => {
  try {
    const id = parseRequiredString(req.params.id, "id", 120);
    const body = parseRequiredObject(req.body, "body");
    const reason = parseRequiredString(body.reason, "reason", 500);

    const result = stopExperiment({ experimentId: id, reason });
    if (!result) {
      res.status(404).json({ error: "Experiment not found" });
      return;
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
