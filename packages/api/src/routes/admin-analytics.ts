import { Router } from "express";
import {
  getAnalyticsOverview,
  getSlotSummaries,
  getSlotVariantSeries,
  resolveWindow,
} from "../services/analytics-service.js";
import { parseOptionalIsoDate, parseOptionalPositiveInt, parseRequiredString } from "../utils/parsers.js";

const router = Router();

router.get("/analytics/overview", (req, res, next) => {
  try {
    const from = parseOptionalIsoDate(req.query.from, "from");
    const to = parseOptionalIsoDate(req.query.to, "to");
    const segmentKey =
      typeof req.query.segmentKey === "string" ? req.query.segmentKey.trim() : undefined;
    const window = resolveWindow(from, to, 14);
    res.json(getAnalyticsOverview(window, segmentKey));
  } catch (error) {
    next(error);
  }
});

router.get("/analytics/slots", (req, res, next) => {
  try {
    const from = parseOptionalIsoDate(req.query.from, "from");
    const to = parseOptionalIsoDate(req.query.to, "to");
    const segmentKey =
      typeof req.query.segmentKey === "string" ? req.query.segmentKey.trim() : undefined;
    const limit = parseOptionalPositiveInt(req.query.limit, "limit", 50);
    const window = resolveWindow(from, to, 14);
    res.json({
      items: getSlotSummaries(window, { segmentKey, limit }),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/analytics/slots/:slotKey/variants", (req, res, next) => {
  try {
    const slotKey = parseRequiredString(req.params.slotKey, "slotKey");
    const from = parseOptionalIsoDate(req.query.from, "from");
    const to = parseOptionalIsoDate(req.query.to, "to");
    const segmentKey =
      typeof req.query.segmentKey === "string" ? req.query.segmentKey.trim() : undefined;
    const bucket =
      req.query.bucket === "hour" || req.query.bucket === "day"
        ? req.query.bucket
        : "day";
    const window = resolveWindow(from, to, 14);
    const series = getSlotVariantSeries(slotKey, window, {
      segmentKey,
      bucket,
    });

    res.json({
      slotKey,
      series,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
