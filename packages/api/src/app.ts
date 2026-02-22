import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import layoutRoutes from "./routes/layout.js";
import telemetryRoutes from "./routes/telemetry.js";
import userRoutes from "./routes/users.js";
import challengeRoutes from "./routes/challenge.js";
import adminAnalyticsRoutes from "./routes/admin-analytics.js";
import adminKnowledgeRoutes from "./routes/admin-knowledge.js";
import adminRecommendationRoutes from "./routes/admin-recommendations.js";
import adminLlmRoutes from "./routes/admin-llm.js";
import adminExperimentRoutes from "./routes/admin-experiments.js";
import adminChallengeRoutes from "./routes/admin-challenge.js";
import adminSaasRoutes from "./routes/admin-saas.js";
import { HttpError } from "./utils/errors.js";
import { requireAdminAuth } from "./middleware/admin-auth.js";

const app = express();
const allowedOrigins = new Set(
  (process.env.MORPHUI_CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use((_, res, next) => {
  const requestId = `req_${nanoid(12)}`;
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

app.use(
  cors({
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) {
      if (
        origin === undefined ||
        allowedOrigins.has("*") ||
        allowedOrigins.has(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(
        new HttpError(403, "Request origin is not allowed by CORS policy.", {
          code: "CORS_ORIGIN_DENIED",
        }),
      );
    },
  }),
);
app.use(express.json({ limit: process.env.MORPHUI_JSON_LIMIT || "256kb" }));

app.use("/api", layoutRoutes);
app.use("/api", telemetryRoutes);
app.use("/api", userRoutes);
app.use("/api", challengeRoutes);
app.use("/api/admin", requireAdminAuth, adminAnalyticsRoutes);
app.use("/api/admin", requireAdminAuth, adminKnowledgeRoutes);
app.use("/api/admin", requireAdminAuth, adminRecommendationRoutes);
app.use("/api/admin", requireAdminAuth, adminLlmRoutes);
app.use("/api/admin", requireAdminAuth, adminExperimentRoutes);
app.use("/api/admin", requireAdminAuth, adminChallengeRoutes);
app.use("/api/admin", requireAdminAuth, adminSaasRoutes);

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  }),
);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const requestId: string = res.locals.requestId || "unknown";
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
      requestId,
    });
    return;
  }

  console.error(`[${requestId}] Unhandled API error`, err);
  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
    requestId,
  });
});

export default app;
