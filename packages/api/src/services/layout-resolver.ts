import { db } from "@morphui/db";
import * as schema from "@morphui/db/schema";
import { eq, and } from "drizzle-orm";
import type { LayoutConfig, SlotConfig } from "../types.js";

export function resolveLayout(userId: string, projectId: string): LayoutConfig | null {
  const user = db.select().from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.projectId, projectId))).get();
  if (!user) return null;

  const slots = db.select().from(schema.slotDefinitions).where(eq(schema.slotDefinitions.projectId, projectId)).all();

  const prefs = db
    .select()
    .from(schema.userPreferences)
    .where(and(eq(schema.userPreferences.userId, userId), eq(schema.userPreferences.projectId, projectId)))
    .all();

  const prefMap = new Map(prefs.map((p) => [p.slotKey, p]));

  const slotConfigs: Record<string, SlotConfig> = {};

  for (const slot of slots) {
    const variants = parseVariantArray(slot.variants);
    if (variants.length === 0) {
      continue;
    }

    const pref = prefMap.get(slot.slotKey);

    let variant = slot.defaultVariant;
    let confidence = 0;

    if (pref) {
      if (variants.includes(pref.resolvedVariant)) {
        variant = pref.resolvedVariant;
      }
      const weights = parseWeightMap(pref.variantWeights);
      confidence = clampConfidence(weights[variant] ?? 0);
    }

    if (!variants.includes(variant)) {
      variant = variants[0];
    }

    slotConfigs[slot.slotKey] = {
      slotKey: slot.slotKey,
      variant,
      availableVariants: variants,
      confidence,
    };
  }

  return {
    userId,
    slots: slotConfigs,
    resolvedAt: new Date().toISOString(),
  };
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

function parseWeightMap(raw: string): Record<string, number> {
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

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
