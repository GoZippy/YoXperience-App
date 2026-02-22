import type { LayoutConfig, TelemetryEventInput } from "./types.js";

export function createMorphClient(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    async fetchLayout(userId: string, signal?: AbortSignal): Promise<LayoutConfig> {
      const res = await fetch(`${normalizedBaseUrl}/api/layout/${userId}`, {
        signal,
      });
      if (!res.ok) throw new Error(`Layout fetch failed: ${res.status}`);
      return res.json();
    },

    async sendTelemetry(userId: string, events: TelemetryEventInput[]): Promise<void> {
      const res = await fetch(`${normalizedBaseUrl}/api/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, events }),
      });
      if (!res.ok) {
        throw new Error(`Telemetry send failed: ${res.status}`);
      }
    },
  };
}
