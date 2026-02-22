import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { HttpError } from "../utils/errors.js";

export function requireAdminAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const configuredKey = process.env.MORPHUI_ADMIN_KEY?.trim() || "";
  const allowInsecureAdmin = isEnabled(process.env.MORPHUI_ALLOW_INSECURE_ADMIN);

  if (!configuredKey) {
    if (allowInsecureAdmin) {
      next();
      return;
    }

    next(
      new HttpError(401, "Admin API key is not configured.", {
        code: "ADMIN_AUTH_NOT_CONFIGURED",
      }),
    );
    return;
  }

  const providedKey = (req.header("x-admin-key") || req.header("x-api-key") || "").trim();
  if (!providedKey || !safeEquals(providedKey, configuredKey)) {
    next(
      new HttpError(401, "Missing or invalid admin credentials.", {
        code: "ADMIN_AUTH_REQUIRED",
      }),
    );
    return;
  }

  next();
}

function isEnabled(value: string | undefined): boolean {
  const normalized = (value || "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function safeEquals(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}
