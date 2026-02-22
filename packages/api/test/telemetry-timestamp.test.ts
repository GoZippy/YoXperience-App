import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { ValidationError } from "../src/utils/errors.js";
import { parseTelemetryPayload } from "../src/validation/telemetry.js";
import { initTestDb, resetDb, seedUserAndSlot } from "./helpers/test-db.js";

test("normalizes telemetry timestamps to canonical UTC before persistence", async () => {
  await initTestDb();
  await resetDb();
  const { userId, slotKey } = await seedUserAndSlot();
  const { db, telemetryEvents } = await initTestDb();
  const { writeTelemetryEvents } = await import("../src/services/telemetry-writer.js");

  const payload = parseTelemetryPayload({
    userId,
    events: [
      {
        slotKey,
        variant: "minimal",
        eventType: "click",
        timestamp: "2026-02-01T12:34:56-05:00",
      },
    ],
  });
  writeTelemetryEvents(payload);

  const row = db
    .select()
    .from(telemetryEvents)
    .where(eq(telemetryEvents.userId, userId))
    .get();

  assert.ok(row);
  assert.equal(row.createdAt, "2026-02-01T17:34:56.000Z");
});

test("rejects telemetry timestamps without timezone information", () => {
  assert.throws(
    () =>
      parseTelemetryPayload({
        userId: "usr_test_001",
        events: [
          {
            slotKey: "hero-banner",
            variant: "minimal",
            eventType: "click",
            timestamp: "2026-02-01T12:34:56",
          },
        ],
      }),
    (error: unknown) =>
      error instanceof ValidationError &&
      error.message.includes("must be an ISO-8601 datetime including timezone"),
  );
});
