import {
  db,
  telemetryEvents,
  userPreferences,
  slotDefinitions,
} from "@morphui/db";
import { eq, isNull, and } from "drizzle-orm";
import { nanoid } from "nanoid";

const EVENT_WEIGHTS: Record<string, number> = {
  impression: 0.0,
  hover: 0.1,
  scroll: 0.15,
  click: 0.5,
  dismiss: -0.3,
};

interface AnalysisResult {
  processedCount: number;
  updatedPreferences: number;
}

export function runAnalysis(): AnalysisResult {
  return db.transaction((tx) => {
    // 1. Fetch unprocessed events
    const unprocessed = tx
      .select()
      .from(telemetryEvents)
      .where(isNull(telemetryEvents.processedAt))
      .limit(500)
      .all();

    if (unprocessed.length === 0) {
      return { processedCount: 0, updatedPreferences: 0 };
    }

    // 2. Group by (projectId, userId, slotKey)
    const groups = new Map<string, typeof unprocessed>();
    for (const evt of unprocessed) {
      const key = `${evt.projectId}::${evt.userId}::${evt.slotKey}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(evt);
    }

    // 3. Load slot definitions
    const slots = tx.select().from(slotDefinitions).all();
    const slotMap = new Map(slots.map((slot) => [`${slot.projectId}::${slot.slotKey}`, slot]));

    let updatedPreferences = 0;
    const ALPHA = 0.3;
    const updatedAt = new Date().toISOString();

    // 4. Process each group
    for (const [key, events] of groups) {
      const [projectId, userId, slotKey] = key.split("::");
      const slotDef = slotMap.get(`${projectId}::${slotKey}`);
      if (!slotDef) continue;

      const allVariants = parseVariantArray(slotDef.variants);
      if (allVariants.length === 0) continue;

      // Calculate delta scores from this batch
      const deltas: Record<string, number> = {};
      for (const evt of events) {
        const weight = EVENT_WEIGHTS[evt.eventType] ?? 0;
        deltas[evt.variant] = (deltas[evt.variant] ?? 0) + weight;
      }

      // Load existing preferences
      const existing = tx
        .select()
        .from(userPreferences)
        .where(
          and(
            eq(userPreferences.userId, userId),
            eq(userPreferences.slotKey, slotKey),
            eq(userPreferences.projectId, projectId)
          ),
        )
        .get();

      let currentWeights: Record<string, number>;
      if (existing) {
        currentWeights = parseVariantWeightMap(existing.variantWeights);
      } else {
        currentWeights = {};
        for (const variant of allVariants) {
          currentWeights[variant] = 1 / allVariants.length;
        }
      }

      // Apply EMA: new = old + alpha * delta
      for (const variant of allVariants) {
        const delta = deltas[variant] ?? 0;
        currentWeights[variant] = Math.max(
          0,
          (currentWeights[variant] ?? 0) + ALPHA * delta,
        );
      }

      // Normalize to sum to 1
      const total = allVariants.reduce(
        (sum, variant) => sum + (currentWeights[variant] ?? 0),
        0,
      );
      if (total > 0) {
        for (const variant of allVariants) {
          currentWeights[variant] = (currentWeights[variant] ?? 0) / total;
        }
      }

      // Pick winner
      const resolvedVariant = allVariants.reduce((best, variant) =>
        (currentWeights[variant] ?? 0) > (currentWeights[best] ?? 0) ? variant : best,
      );

      // Upsert preference
      if (existing) {
        tx.update(userPreferences)
          .set({
            variantWeights: JSON.stringify(currentWeights),
            resolvedVariant,
            updatedAt,
          })
          .where(eq(userPreferences.id, existing.id))
          .run();
      } else {
        tx.insert(userPreferences)
          .values({
            id: `pref_${nanoid(10)}`,
            projectId,
            userId,
            slotKey,
            variantWeights: JSON.stringify(currentWeights),
            resolvedVariant,
            updatedAt,
          })
          .run();
      }

      updatedPreferences++;
    }

    // 5. Mark events as processed in the same transaction
    const processedAt = new Date().toISOString();
    for (const evt of unprocessed) {
      tx.update(telemetryEvents)
        .set({ processedAt })
        .where(eq(telemetryEvents.id, evt.id))
        .run();
    }

    return { processedCount: unprocessed.length, updatedPreferences };
  });
}

function parseVariantArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((item): item is string => typeof item === "string")
          .map((variant) => variant.trim())
          .filter(Boolean),
      ),
    );
  } catch {
    return [];
  }
}

function parseVariantWeightMap(raw: string): Record<string, number> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    const output: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        output[key] = value;
      }
    }
    return output;
  } catch {
    return {};
  }
}
