import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { requireAdminAuth } from "../src/middleware/admin-auth.js";
import { HttpError } from "../src/utils/errors.js";
import { withEnv } from "./helpers/env.js";

function runMiddleware(headers: Record<string, string | undefined>) {
  let forwardedError: unknown = undefined;
  const req = {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as Request;

  requireAdminAuth(req, {} as Response, (error?: unknown) => {
    forwardedError = error;
  });

  return forwardedError;
}

test("rejects admin routes by default when key is not configured", async () => {
  await withEnv(
    {
      MORPHUI_ADMIN_KEY: undefined,
      MORPHUI_ALLOW_INSECURE_ADMIN: undefined,
    },
    async () => {
      const error = runMiddleware({});
      assert.ok(error instanceof HttpError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, "ADMIN_AUTH_NOT_CONFIGURED");
    },
  );
});

test("allows admin routes only when explicit insecure override is enabled", async () => {
  await withEnv(
    {
      MORPHUI_ADMIN_KEY: undefined,
      MORPHUI_ALLOW_INSECURE_ADMIN: "true",
    },
    async () => {
      const error = runMiddleware({});
      assert.equal(error, undefined);
    },
  );
});

test("rejects invalid admin key and accepts valid admin key", async () => {
  await withEnv(
    {
      MORPHUI_ADMIN_KEY: "top-secret",
      MORPHUI_ALLOW_INSECURE_ADMIN: undefined,
    },
    async () => {
      const badError = runMiddleware({ "x-admin-key": "wrong" });
      assert.ok(badError instanceof HttpError);
      assert.equal(badError.statusCode, 401);
      assert.equal(badError.code, "ADMIN_AUTH_REQUIRED");

      const goodError = runMiddleware({ "x-admin-key": "top-secret" });
      assert.equal(goodError, undefined);
    },
  );
});
