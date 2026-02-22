import { db } from "@morphui/db";
import * as schema from "@morphui/db/schema";
import { nanoid } from "nanoid";
import type { TelemetryPayload } from "../types.js";

export function writeTelemetryEvents(payload: TelemetryPayload, projectId: string): number {
  const now = new Date().toISOString();
  const rows = payload.events.map((evt) => {
    const timestamp = evt.timestamp || now;

    return {
      id: `evt_${nanoid(10)}`,
      projectId,
      userId: payload.userId,
      slotKey: evt.slotKey,
      variant: evt.variant,
      eventType: evt.eventType,
      metadata: evt.metadata ? JSON.stringify(evt.metadata) : null,
      createdAt: timestamp,
    };
  });

  db.insert(schema.telemetryEvents).values(rows).run();
  return rows.length;
}
