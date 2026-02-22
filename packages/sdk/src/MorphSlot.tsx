import { useEffect } from "react";
import { useMorphContext } from "./MorphProvider.js";
import type {
  MorphSlotProps,
  VariantProps,
  MorphContextValue,
  TelemetryEventType,
} from "./types.js";

export function MorphSlot({ name, variants, fallback = null }: MorphSlotProps) {
  const { config, isLoading, trackEvent } = useMorphContext();

  if (isLoading || !config) {
    return <>{fallback}</>;
  }

  const slotConfig = config.slots[name];
  if (!slotConfig) {
    console.warn(`MorphSlot: no config found for slot "${name}"`);
    return null;
  }

  const Component = variants[slotConfig.variant];
  if (!Component) {
    console.warn(
      `MorphSlot: no component for variant "${slotConfig.variant}" in slot "${name}". ` +
        `Available: ${Object.keys(variants).join(", ")}`,
    );
    const fallbackKey = Object.keys(variants)[0];
    if (!fallbackKey) return null;
    const FallbackComponent = variants[fallbackKey];
    return (
      <SlotWrapper
        Component={FallbackComponent}
        slotKey={name}
        variant={fallbackKey}
        trackEvent={trackEvent}
      />
    );
  }

  return (
    <SlotWrapper
      Component={Component}
      slotKey={name}
      variant={slotConfig.variant}
      trackEvent={trackEvent}
    />
  );
}

function SlotWrapper({
  Component,
  slotKey,
  variant,
  trackEvent,
}: {
  Component: React.ComponentType<VariantProps>;
  slotKey: string;
  variant: string;
  trackEvent: MorphContextValue["trackEvent"];
}) {
  useEffect(() => {
    trackEvent(slotKey, variant, "impression");
  }, [slotKey, variant, trackEvent]);

  const boundTrack = (
    eventType: TelemetryEventType,
    metadata?: Record<string, unknown>,
  ) => {
    trackEvent(slotKey, variant, eventType, metadata);
  };

  return (
    <Component slotKey={slotKey} variant={variant} trackEvent={boundTrack} />
  );
}
