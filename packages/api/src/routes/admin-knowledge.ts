import { Router } from "express";
import {
  getKnowledgeComponent,
  getKnowledgeJob,
  reindexKnowledge,
} from "../services/knowledge-index-service.js";
import { ValidationError } from "../utils/errors.js";
import { parseRequiredObject, parseRequiredString } from "../utils/parsers.js";

const router = Router();

router.post("/knowledge/reindex", async (req, res, next) => {
  try {
    const body = parseRequiredObject(req.body, "body");
    const source = parseRequiredString(body.source, "source", 100);

    if (!Array.isArray(body.paths) || body.paths.length === 0) {
      throw new ValidationError("paths must be a non-empty string array.");
    }
    const paths = body.paths.map((item, idx) =>
      parseRequiredString(item, `paths[${idx}]`, 600),
    );
    const versionTag =
      body.versionTag === undefined
        ? null
        : parseRequiredString(body.versionTag, "versionTag", 120);

    const result = await reindexKnowledge({
      projectId: "prj_system",
      source,
      paths,
      versionTag,
    });

    res.status(202).json({
      jobId: result.jobId,
      status: result.status,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/knowledge/jobs/:jobId", (req, res, next) => {
  try {
    const jobId = parseRequiredString(req.params.jobId, "jobId", 120);
    const job = getKnowledgeJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({
      jobId: job.id,
      status: job.status,
      documentsIndexed: job.documentsIndexed,
      chunksIndexed: job.chunksIndexed,
      failedDocuments: job.failedDocuments,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/knowledge/components/:componentId", (req, res, next) => {
  try {
    const componentId = parseRequiredString(req.params.componentId, "componentId", 200);
    const component = getKnowledgeComponent(componentId);
    if (!component) {
      res.status(404).json({ error: "Component knowledge not found" });
      return;
    }
    res.json(component);
  } catch (error) {
    next(error);
  }
});

export default router;
