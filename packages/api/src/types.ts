export interface LayoutConfig {
  userId: string;
  slots: Record<string, SlotConfig>;
  resolvedAt: string;
}

export interface SlotConfig {
  slotKey: string;
  variant: string;
  availableVariants: string[];
  confidence: number;
}

export interface TelemetryPayload {
  userId: string;
  events: TelemetryEvent[];
}

export const TELEMETRY_EVENT_TYPES = [
  "impression",
  "click",
  "dismiss",
  "hover",
  "scroll",
] as const;

export type TelemetryEventType = (typeof TELEMETRY_EVENT_TYPES)[number];

export interface TelemetryEvent {
  slotKey: string;
  variant: string;
  eventType: TelemetryEventType;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}
