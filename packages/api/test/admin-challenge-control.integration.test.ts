import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import test from "node:test";
import { withEnv } from "./helpers/env.js";
import { initTestDb, resetDb } from "./helpers/test-db.js";

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

test("admin can force challenge adaptation overrides", async () => {
  await resetDb();

  await withEnv(
    {
      MORPHUI_ADMIN_KEY: "test-admin-key",
      MORPHUI_LLM_MODE: "remote",
      MORPHUI_OPENAI_API_KEY: undefined,
      MORPHUI_GEMINI_API_KEY: undefined,
      MORPHUI_CLAUDE_API_KEY: undefined,
    },
    async () => {
      const { server, baseUrl } = await startServer();
      try {
        const configResponse = await fetch(`${baseUrl}/api/admin/challenge/control`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-key": "test-admin-key",
          },
          body: JSON.stringify({
            enabled: true,
            layoutStyle: "focus",
            hideDecoys: true,
            showConnectors: true,
            showSidebarHints: true,
            spotlightNextStep: true,
            nextRunMessage: "Admin-controlled challenge demo mode.",
            rationale: "Force focus mode to showcase impact quickly.",
          }),
        });

        assert.equal(configResponse.status, 200);
        const configPayload = (await configResponse.json()) as {
          enabled: boolean;
          layoutStyle: string | null;
        };
        assert.equal(configPayload.enabled, true);
        assert.equal(configPayload.layoutStyle, "focus");

        const optimizeResponse = await fetch(`${baseUrl}/api/challenge/optimize`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            workflowName: "Admin override test",
            runNumber: 2,
            totalDurationMs: 22000,
            totalWrongClicks: 1,
            decoyClicks: 0,
            steps: [
              {
                stepId: "account_create",
                label: "Create account",
                durationMs: 7000,
                wrongClicks: 0,
              },
              {
                stepId: "email_verify",
                label: "Verify email",
                durationMs: 8000,
                wrongClicks: 1,
              },
              {
                stepId: "profile_save",
                label: "Save profile",
                durationMs: 7000,
                wrongClicks: 0,
              },
            ],
          }),
        });

        assert.equal(optimizeResponse.status, 200);
        const optimizePayload = (await optimizeResponse.json()) as {
          plan: {
            layoutStyle: string;
            hideDecoys: boolean;
            nextRunMessage: string;
            rationale: string;
          };
          meta: {
            adminOverrideApplied: boolean;
          };
        };
        assert.equal(optimizePayload.plan.layoutStyle, "focus");
        assert.equal(optimizePayload.plan.hideDecoys, true);
        assert.equal(
          optimizePayload.plan.nextRunMessage,
          "Admin-controlled challenge demo mode.",
        );
        assert.equal(
          optimizePayload.plan.rationale,
          "Force focus mode to showcase impact quickly.",
        );
        assert.equal(optimizePayload.meta.adminOverrideApplied, true);

        const resetResponse = await fetch(`${baseUrl}/api/admin/challenge/control/reset`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-key": "test-admin-key",
          },
          body: JSON.stringify({}),
        });
        assert.equal(resetResponse.status, 200);
      } finally {
        await stopServer(server);
      }
    },
  );
});
