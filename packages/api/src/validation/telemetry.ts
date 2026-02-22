import {
  TELEMETRY_EVENT_TYPES,
  type TelemetryEvent,
  type TelemetryPayload,
} from "../types.js";
import { ValidationError, isRecord } from "../utils/errors.js";

const MAX_EVENTS_PER_REQUEST = 100;
const MAX_METADATA_KEYS = 50;
const MAX_STRING_LENGTH = 128;
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_EVENT_TYPES: ReadonlySet<TelemetryEvent["eventType"]> = new Set(
  TELEMETRY_EVENT_TYPES,
);

export function parseTelemetryPayload(payload: unknown): TelemetryPayload {
  if (!isRecord(payload)) {
    throw new ValidationError("Payload must be a JSON object.");
  }

  const userId = parseRequiredString(payload.userId, "userId");

  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    throw new ValidationError("events must be a non-empty array.");
  }
  if (payload.events.length > MAX_EVENTS_PER_REQUEST) {
    throw new ValidationError(
      `events must contain at most ${MAX_EVENTS_PER_REQUEST} items.`,
    );
  }

  const events = payload.events.map((evt, index) => parseTelemetryEvent(evt, index));
  return { userId, events };
}

function parseTelemetryEvent(input: unknown, index: number): TelemetryEvent {
  if (!isRecord(input)) {
    throw new ValidationError(`events[${index}] must be an object.`);
  }

  const slotKey = parseRequiredString(input.slotKey, `events[${index}].slotKey`);
  const variant = parseRequiredString(input.variant, `events[${index}].variant`);
  const eventType = parseRequiredString(
    input.eventType,
    `events[${index}].eventType`,
  );

  if (!ALLOWED_EVENT_TYPES.has(eventType as TelemetryEvent["eventType"])) {
    throw new ValidationError(
      `events[${index}].eventType must be one of: ${Array.from(ALLOWED_EVENT_TYPES).join(", ")}.`,
    );
  }

  let metadata: Record<string, unknown> | undefined;
  if (input.metadata !== undefined) {
    if (!isRecord(input.metadata)) {
      throw new ValidationError(`events[${index}].metadata must be an object.`);
    }
    const metadataKeys = Object.keys(input.metadata);
    if (metadataKeys.length > MAX_METADATA_KEYS) {
      throw new ValidationError(
        `events[${index}].metadata has too many keys (max ${MAX_METADATA_KEYS}).`,
      );
    }
    metadata = input.metadata;
  }

  let timestamp: string | undefined;
  if (input.timestamp !== undefined) {
    timestamp = parseIsoTimestamp(input.timestamp, `events[${index}].timestamp`);
  }

  return {
    slotKey,
    variant,
    eventType: eventType as TelemetryEvent["eventType"],
    metadata,
    timestamp,
  };
}

function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty.`);
  }
  if (trimmed.length > MAX_STRING_LENGTH) {
    throw new ValidationError(
      `${fieldName} exceeds max length (${MAX_STRING_LENGTH}).`,
    );
  }
  return trimmed;
}

function parseIsoTimestamp(value: unknown, fieldName: string): string {
  const timestamp = parseRequiredString(value, fieldName);
  if (!ISO_DATETIME_PATTERN.test(timestamp)) {
    throw new ValidationError(
      `${fieldName} must be an ISO-8601 datetime including timezone (Z or +/-HH:MM).`,
    );
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid ISO-8601 datetime.`);
  }

  return parsed.toISOString();
}
