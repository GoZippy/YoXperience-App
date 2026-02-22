import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { Server } from "node:http";
import { initTestDb, resetDb } from "./helpers/test-db.js";
import { withEnv } from "./helpers/env.js";

async function startServer(): Promise<{
  server: Server;
  baseUrl: string;
}> {
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

test("admin API endpoints return 401 when key is not configured", async () => {
  await resetDb();
  await withEnv(
    {
      MORPHUI_ADMIN_KEY: undefined,
      MORPHUI_ALLOW_INSECURE_ADMIN: undefined,
    },
    async () => {
      const { server, baseUrl } = await startServer();
      try {
        const response = await fetch(`${baseUrl}/api/admin/analytics/overview`);
        assert.equal(response.status, 401);
        const payload = (await response.json()) as { code?: string };
        assert.equal(payload.code, "ADMIN_AUTH_NOT_CONFIGURED");
      } finally {
        await stopServer(server);
      }
    },
  );
});

test("admin API endpoints succeed with the configured admin key", async () => {
  await resetDb();
  await withEnv(
    {
      MORPHUI_ADMIN_KEY: "integration-key",
      MORPHUI_ALLOW_INSECURE_ADMIN: undefined,
    },
    async () => {
      const { server, baseUrl } = await startServer();
      try {
        const response = await fetch(`${baseUrl}/api/admin/analytics/overview`, {
          headers: {
            "x-admin-key": "integration-key",
          },
        });
        assert.equal(response.status, 200);
      } finally {
        await stopServer(server);
      }
    },
  );
});
