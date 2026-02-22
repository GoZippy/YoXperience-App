import { Request, Response, NextFunction } from "express";
import { db } from "@morphui/db";
import * as schema from "@morphui/db/schema";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      projectId?: string;
    }
  }
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const publishableKey = authHeader.split(" ")[1];

  try {
    const keys = db
      .select({ projectId: schema.apiKeys.projectId })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.key, publishableKey))
      .limit(1)
      .all();

    const key = keys[0];

    if (!key) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    req.projectId = key.projectId;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
