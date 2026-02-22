import { Router } from "express";
import {
  approveRecommendation,
  generateRecommendationRun,
  getRecommendationDetail,
  listRecommendations,
  rejectRecommendation,
} from "../services/recommendation-service.js";
import { ValidationError } from "../utils/errors.js";
import {
  parseOptionalStringArray,
  parseOptionalIsoDate,
  parseOptionalPositiveInt,
  parseRequiredObject,
  parseRequiredString,
} from "../utils/parsers.js";

const router = Router();

router.post("/recommendations/generate", async (req, res, next) => {
  try {
    const body = parseRequiredObject(req.body, "body");
    const slotKeys = parseOptionalStringArray(body.slotKeys, "slotKeys", 120) || undefined;
    const segmentKeys =
      parseOptionalStringArray(body.segmentKeys, "segmentKeys", 120) || undefined;
    const maxRecommendations = parseOptionalPositiveInt(
      body.maxRecommendations,
      "maxRecommendations",
      20,
    );
    const trigger =
      body.trigger === "scheduled" || body.trigger === "manual"
        ? body.trigger
        : "manual";

    const window = body.window
      ? {
          from: parseOptionalIsoDate(
            parseRequiredObject(body.window, "window").from,
            "window.from",
          ),
          to: parseOptionalIsoDate(
            parseRequiredObject(body.window, "window").to,
            "window.to",
          ),
        }
      : undefined;

    const result = await generateRecommendationRun({
      slotKeys,
      segmentKeys,
      maxRecommendations,
      trigger,
      window,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/recommendations", (req, res, next) => {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const slotKey =
      typeof req.query.slotKey === "string" ? req.query.slotKey.trim() : undefined;
    const segmentKey =
      typeof req.query.segmentKey === "string"
        ? req.query.segmentKey.trim()
        : undefined;
    const limit = parseOptionalPositiveInt(req.query.limit, "limit", 50);
    const items = listRecommendations({
      status,
      slotKey,
      segmentKey,
      limit,
    });
    res.json({ items, nextCursor: null });
  } catch (error) {
    next(error);
  }
});

router.get("/recommendations/:id", (req, res, next) => {
  try {
    const id = parseRequiredString(req.params.id, "id", 120);
    const detail = getRecommendationDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.post("/recommendations/:id/approve", (req, res, next) => {
  try {
    const id = parseRequiredString(req.params.id, "id", 120);
    const body = parseRequiredObject(req.body, "body");
    const approvedBy = parseRequiredString(body.approvedBy, "approvedBy", 120);
    const rolloutPercent = parseOptionalPositiveInt(
      body.rolloutPercent,
      "rolloutPercent",
      20,
    );
    const durationDays = parseOptionalPositiveInt(body.durationDays, "durationDays", 14);

    if (rolloutPercent > 100) {
      throw new ValidationError("rolloutPercent cannot exceed 100.");
    }

    const result = approveRecommendation({
      recommendationId: id,
      approvedBy,
      rolloutPercent,
      durationDays,
    });
    if (!result) {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/recommendations/:id/reject", (req, res, next) => {
  try {
    const id = parseRequiredString(req.params.id, "id", 120);
    const body = parseRequiredObject(req.body, "body");
    const rejectedBy = parseRequiredString(body.rejectedBy, "rejectedBy", 120);
    const reason = parseRequiredString(body.reason, "reason", 500);

    const result = rejectRecommendation({
      recommendationId: id,
      rejectedBy,
      reason,
    });
    if (!result) {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
