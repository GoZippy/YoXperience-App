import { Router } from "express";
import { writeTelemetryEvents } from "../services/telemetry-writer.js";
import { parseTelemetryPayload } from "../validation/telemetry.js";
import { requireApiKey } from "../middleware/auth.js";

const router = Router();

router.post("/telemetry", requireApiKey as any, (req, res, next) => {
  try {
    const projectId = req.projectId;
    if (!projectId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = parseTelemetryPayload(req.body);
    const count = writeTelemetryEvents(payload, projectId);
    res.status(202).json({ accepted: count });
  } catch (error) {
    next(error);
  }
});

export default router;
