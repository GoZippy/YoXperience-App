import { useMorphContext } from "./MorphProvider.js";
import type { SlotConfig, TelemetryEventType } from "./types.js";

export function useMorphSlot(slotKey: string): {
  slot: SlotConfig | null;
  isLoading: boolean;
  trackEvent: (
    eventType: TelemetryEventType,
    metadata?: Record<string, unknown>,
  ) => void;
} {
  const { config, isLoading, trackEvent } = useMorphContext();
  const slot = config?.slots[slotKey] ?? null;

  return {
    slot,
    isLoading,
    trackEvent: (eventType, metadata) => {
      if (slot) {
        trackEvent(slotKey, slot.variant, eventType, metadata);
      }
    },
  };
}
