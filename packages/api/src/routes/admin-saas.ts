import { Router } from "express";
import { db } from "@morphui/db";
import * as schema from "@morphui/db/schema";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

const router = Router();

// List organizations
router.get("/organizations", (req, res, next) => {
  try {
    const orgs = db.select().from(schema.organizations).all();
    res.json(orgs);
  } catch (error) {
    next(error);
  }
});

// Create organization
router.post("/organizations", (req, res, next) => {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) return res.status(400).json({ error: "Missing name or slug" });

    const id = `org_${nanoid(10)}`;
    db.insert(schema.organizations).values({ id, name, slug }).run();
    res.status(201).json({ id, name, slug });
  } catch (error) {
    next(error);
  }
});

// List projects for an org
router.get("/organizations/:orgId/projects", (req, res, next) => {
  try {
    const projects = db.select().from(schema.projects).where(eq(schema.projects.organizationId, req.params.orgId)).all();
    res.json(projects);
  } catch (error) {
    next(error);
  }
});

// Create project
router.post("/organizations/:orgId/projects", (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });

    const id = `prj_${nanoid(10)}`;
    db.insert(schema.projects).values({
      id,
      organizationId: req.params.orgId,
      name
    }).run();
    
    res.status(201).json({ id, organizationId: req.params.orgId, name });
  } catch (error) {
    next(error);
  }
});

// List API Keys for project
router.get("/projects/:projectId/keys", (req, res, next) => {
  try {
    const keys = db.select().from(schema.apiKeys).where(eq(schema.apiKeys.projectId, req.params.projectId)).all();
    res.json(keys);
  } catch (error) {
    next(error);
  }
});

// Create API Key
router.post("/projects/:projectId/keys", (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });

    const key = `pk_live_${nanoid(24)}`;
    db.insert(schema.apiKeys).values({
      key,
      projectId: req.params.projectId,
      name
    }).run();
    
    res.status(201).json({ key, name, projectId: req.params.projectId });
  } catch (error) {
    next(error);
  }
});

export default router;