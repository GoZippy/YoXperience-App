import { Router } from "express";
import { resolveLayout } from "../services/layout-resolver.js";
import { ValidationError } from "../utils/errors.js";
import { requireApiKey } from "../middleware/auth.js";

const router = Router();

router.get("/layout/:userId", requireApiKey as any, (req, res, next) => {
  try {
    const userId = req.params.userId?.trim();
    const projectId = req.projectId;
    
    if (!userId) {
      throw new ValidationError("userId path parameter is required.");
    }
    
    if (!projectId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const layout = resolveLayout(userId, projectId);
    if (!layout) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(layout);
  } catch (error) {
    next(error);
  }
});

export default router;
