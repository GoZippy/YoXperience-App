import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import test from "node:test";
import { initTestDb, resetDb } from "./helpers/test-db.js";
import { withEnv } from "./helpers/env.js";

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  await initTestDb();
  const { default: app } = await import("../src/app.js");
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

test("challenge optimize returns plan + meta for valid input", async () => {
  await resetDb();

  await withEnv(
    {
      MORPHUI_OPENAI_API_KEY: undefined,
      MORPHUI_GEMINI_API_KEY: undefined,
      MORPHUI_LLM_PROVIDER: undefined,
      MORPHUI_LLM_MODE: "remote",
    },
    async () => {
      const { server, baseUrl } = await startServer();
      try {
        const response = await fetch(`${baseUrl}/api/challenge/optimize`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            workflowName: "Launch onboarding campaign",
            runNumber: 1,
            totalDurationMs: 52100,
            totalWrongClicks: 5,
            decoyClicks: 3,
            steps: [
              {
                stepId: "define-goal",
                label: "Define Goal",
                durationMs: 12000,
                wrongClicks: 2,
              },
              {
                stepId: "pick-audience",
                label: "Pick Audience",
                durationMs: 16000,
                wrongClicks: 1,
              },
              {
                stepId: "review-launch",
                label: "Review and Launch",
                durationMs: 24100,
                wrongClicks: 2,
              },
            ],
          }),
        });

        assert.equal(response.status, 200);
        const payload = (await response.json()) as {
          plan: {
            layoutStyle: string;
            emphasizeStepIds: string[];
            hideDecoys: boolean;
            showConnectors: boolean;
            showSidebarHints: boolean;
            spotlightNextStep: boolean;
            nextRunMessage: string;
            rationale: string;
          };
          meta: {
            strategy: string;
            remoteEligible: boolean;
            provider: string;
            executionMode: string;
            generatedAt: string;
          };
        };

        assert.ok(payload.plan);
        assert.ok(["busy", "guided", "focus"].includes(payload.plan.layoutStyle));
        assert.ok(Array.isArray(payload.plan.emphasizeStepIds));
        assert.equal(typeof payload.plan.hideDecoys, "boolean");
        assert.equal(typeof payload.plan.showConnectors, "boolean");
        assert.equal(typeof payload.plan.showSidebarHints, "boolean");
        assert.equal(typeof payload.plan.spotlightNextStep, "boolean");
        assert.equal(typeof payload.plan.nextRunMessage, "string");
        assert.equal(typeof payload.plan.rationale, "string");

        assert.equal(payload.meta.strategy, "remote-or-fallback");
        assert.equal(payload.meta.remoteEligible, false);
        assert.equal(payload.meta.provider, "none");
        assert.equal(payload.meta.executionMode, "fallback");
        assert.match(payload.meta.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
      } finally {
        await stopServer(server);
      }
    },
  );
});

test("challenge optimize rejects invalid input", async () => {
  await resetDb();

  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/challenge/optimize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workflowName: "Launch onboarding campaign",
        runNumber: 0,
        totalDurationMs: -1,
        totalWrongClicks: 0,
        decoyClicks: 0,
        steps: [],
      }),
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { code?: string };
    assert.equal(payload.code, "VALIDATION_ERROR");
  } finally {
    await stopServer(server);
  }
});
