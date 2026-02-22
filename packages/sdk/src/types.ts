import type { ReactNode, ComponentType } from "react";

export type TelemetryEventType =
  | "impression"
  | "click"
  | "dismiss"
  | "hover"
  | "scroll";

export interface TelemetryEventInput {
  slotKey: string;
  variant: string;
  eventType: TelemetryEventType;
  metadata?: Record<string, unknown>;
}

export interface SlotConfig {
  slotKey: string;
  variant: string;
  availableVariants: string[];
  confidence: number;
}

export interface LayoutConfig {
  userId: string;
  slots: Record<string, SlotConfig>;
  resolvedAt: string;
}

export interface MorphProviderProps {
  apiBaseUrl: string;
  userId: string;
  children: ReactNode;
  pollInterval?: number;
  onConfigLoaded?: (config: LayoutConfig) => void;
}

export interface VariantProps {
  slotKey: string;
  variant: string;
  trackEvent: (
    eventType: TelemetryEventType,
    metadata?: Record<string, unknown>,
  ) => void;
}

export interface MorphSlotProps {
  name: string;
  variants: Record<string, ComponentType<VariantProps>>;
  fallback?: ReactNode;
}

export interface MorphContextValue {
  config: LayoutConfig | null;
  isLoading: boolean;
  error: Error | null;
  trackEvent: (
    slotKey: string,
    variant: string,
    eventType: TelemetryEventType,
    metadata?: Record<string, unknown>,
  ) => void;
}
