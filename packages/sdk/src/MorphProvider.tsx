import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { createMorphClient } from "./client.js";
import type {
  LayoutConfig,
  MorphContextValue,
  MorphProviderProps,
  TelemetryEventInput,
  TelemetryEventType,
} from "./types.js";

const MorphContext = createContext<MorphContextValue | null>(null);
const TELEMETRY_FLUSH_INTERVAL_MS = 2000;
const MAX_BUFFERED_EVENTS = 2000;

interface BufferedTelemetryEvent extends TelemetryEventInput {
  userId: string;
}

export function useMorphContext(): MorphContextValue {
  const ctx = useContext(MorphContext);
  if (!ctx)
    throw new Error("useMorphContext must be used within <MorphProvider>");
  return ctx;
}

export function MorphProvider({
  apiBaseUrl,
  userId,
  children,
  pollInterval = 0,
  onConfigLoaded,
}: MorphProviderProps) {
  const [config, setConfig] = useState<LayoutConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const clientRef = useRef(createMorphClient(apiBaseUrl));
  const fetchSequenceRef = useRef(0);
  const flushInFlightRef = useRef(false);
  const eventBufferRef = useRef<BufferedTelemetryEvent[]>([]);

  const trimBuffer = useCallback(() => {
    const overflow = eventBufferRef.current.length - MAX_BUFFERED_EVENTS;
    if (overflow > 0) {
      // Drop oldest buffered events first to keep memory bounded.
      eventBufferRef.current.splice(0, overflow);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    const sequence = ++fetchSequenceRef.current;
    try {
      const layout = await clientRef.current.fetchLayout(userId);
      if (sequence !== fetchSequenceRef.current) return;
      setConfig(layout);
      setError(null);
      onConfigLoaded?.(layout);
    } catch (err) {
      if (sequence !== fetchSequenceRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (sequence !== fetchSequenceRef.current) return;
      setIsLoading(false);
    }
  }, [userId, onConfigLoaded]);

  const flushTelemetry = useCallback(async () => {
    if (flushInFlightRef.current) return;

    const batch = eventBufferRef.current.splice(0);
    if (batch.length === 0) return;

    flushInFlightRef.current = true;
    try {
      const byUser = new Map<string, BufferedTelemetryEvent[]>();
      for (const event of batch) {
        if (!byUser.has(event.userId)) byUser.set(event.userId, []);
        byUser.get(event.userId)!.push(event);
      }

      const failedEvents: BufferedTelemetryEvent[] = [];
      for (const [bufferedUserId, bufferedEvents] of byUser.entries()) {
        try {
          await clientRef.current.sendTelemetry(
            bufferedUserId,
            bufferedEvents.map((event) => ({
              slotKey: event.slotKey,
              variant: event.variant,
              eventType: event.eventType,
              metadata: event.metadata,
            })),
          );
        } catch (sendError) {
          failedEvents.push(...bufferedEvents);
          console.warn(
            "MorphProvider: telemetry send failed; events will be retried.",
            sendError,
          );
        }
      }

      if (failedEvents.length > 0) {
        eventBufferRef.current.unshift(...failedEvents);
        trimBuffer();
      }
    } finally {
      flushInFlightRef.current = false;
    }
  }, [trimBuffer]);

  // Initial fetch + polling
  useEffect(() => {
    clientRef.current = createMorphClient(apiBaseUrl);
    setIsLoading(true);
    void fetchConfig();

    if (pollInterval > 0) {
      const interval = setInterval(() => {
        void fetchConfig();
      }, pollInterval);
      return () => clearInterval(interval);
    }
  }, [apiBaseUrl, fetchConfig, pollInterval]);

  // Flush telemetry buffer on a cadence and on provider cleanup.
  useEffect(() => {
    const flush = setInterval(() => {
      void flushTelemetry();
    }, TELEMETRY_FLUSH_INTERVAL_MS);

    return () => {
      clearInterval(flush);
      void flushTelemetry();
    };
  }, [apiBaseUrl, flushTelemetry, userId]);

  const trackEvent = useCallback(
    (
      slotKey: string,
      variant: string,
      eventType: TelemetryEventType,
      metadata?: Record<string, unknown>,
    ) => {
      eventBufferRef.current.push({
        userId,
        slotKey,
        variant,
        eventType,
        metadata,
      });
      trimBuffer();
    },
    [trimBuffer, userId],
  );

  return (
    <MorphContext.Provider value={{ config, isLoading, error, trackEvent }}>
      {children}
    </MorphContext.Provider>
  );
}
