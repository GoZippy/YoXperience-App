import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ValidationError } from "../src/utils/errors.js";
import { withEnv } from "./helpers/env.js";
import { initTestDb, resetDb } from "./helpers/test-db.js";

test("rejects knowledge paths outside MORPHUI_KNOWLEDGE_ALLOWED_ROOTS", async () => {
  await initTestDb();
  await resetDb();
  const allowedRoot = await mkdtemp(path.join(tmpdir(), "morphui-knowledge-allowed-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "morphui-knowledge-outside-"));

  await withEnv(
    {
      MORPHUI_KNOWLEDGE_ALLOWED_ROOTS: allowedRoot,
      MORPHUI_KNOWLEDGE_ALLOW_GLOBS: "false",
    },
    async () => {
      const { reindexKnowledge } = await import("../src/services/knowledge-index-service.js");
      await assert.rejects(
        () =>
          reindexKnowledge({
            source: "test",
            paths: [outsideRoot],
            versionTag: "test-v1",
          }),
        (error: unknown) =>
          error instanceof ValidationError &&
          error.message.includes("outside MORPHUI_KNOWLEDGE_ALLOWED_ROOTS"),
      );
    },
  );
});

test("rejects glob patterns when globbing is disabled", async () => {
  await initTestDb();
  await resetDb();
  const allowedRoot = await mkdtemp(path.join(tmpdir(), "morphui-knowledge-glob-"));
  await writeFile(path.join(allowedRoot, "component.md"), "# component");

  await withEnv(
    {
      MORPHUI_KNOWLEDGE_ALLOWED_ROOTS: allowedRoot,
      MORPHUI_KNOWLEDGE_ALLOW_GLOBS: "false",
    },
    async () => {
      const { reindexKnowledge } = await import("../src/services/knowledge-index-service.js");
      await assert.rejects(
        () =>
          reindexKnowledge({
            source: "test",
            paths: [path.join(allowedRoot, "*.md")],
            versionTag: "test-v1",
          }),
        (error: unknown) =>
          error instanceof ValidationError &&
          error.message.includes("Glob patterns are disabled"),
      );
    },
  );
});

test("indexes files inside allowed roots when globbing is disabled", async () => {
  await initTestDb();
  await resetDb();
  const allowedRoot = await mkdtemp(path.join(tmpdir(), "morphui-knowledge-ok-"));
  const componentPath = path.join(allowedRoot, "component.md");
  await writeFile(componentPath, "# Component\n\nThis component is adaptive.");

  const result = await withEnv(
    {
      MORPHUI_KNOWLEDGE_ALLOWED_ROOTS: allowedRoot,
      MORPHUI_KNOWLEDGE_ALLOW_GLOBS: "false",
    },
    async () => {
      const { reindexKnowledge } = await import("../src/services/knowledge-index-service.js");
      return reindexKnowledge({
        source: "test",
        paths: [componentPath],
        versionTag: "test-v1",
      });
    },
  );

  assert.equal(result.status, "completed");
  assert.equal(result.documentsIndexed, 1);
  assert.ok(result.chunksIndexed >= 1);
});
