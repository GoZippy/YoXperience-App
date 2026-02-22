import {
  db,
  telemetryEvents,
  recommendations,
  userPreferences,
} from "@morphui/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export interface TimeWindow {
  from: string;
  to: string;
}

export interface SlotSummary {
  slotKey: string;
  impressions: number;
  clicks: number;
  ctr: number;
  topVariant: string | null;
  confidenceSpread: number;
}

export interface VariantPoint {
  t: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface SlotVariantSeries {
  variant: string;
  points: VariantPoint[];
}

export interface CrossSlotInsight {
  slotA: string;
  variantA: string;
  slotB: string;
  variantB: string;
  count: number;
}

type Bucket = "hour" | "day";

export function resolveWindow(
  from?: string | null,
  to?: string | null,
  defaultDays = 14,
): TimeWindow {
  const toIso = to ? new Date(to).toISOString() : new Date().toISOString();
  const fromIso = from
    ? new Date(from).toISOString()
    : new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000).toISOString();
  return { from: fromIso, to: toIso };
}

export function getAnalyticsOverview(window: TimeWindow, segmentKey?: string) {
  const where = telemetryWhere(window, segmentKey);
  const eventRows = db
    .select({
      eventType: telemetryEvents.eventType,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(telemetryEvents)
    .where(where)
    .groupBy(telemetryEvents.eventType)
    .all();

  const counters = new Map(eventRows.map((row) => [row.eventType, row.count]));
  const impressions = counters.get("impression") ?? 0;
  const clicks = counters.get("click") ?? 0;
  const totals = eventRows.reduce((sum, row) => sum + row.count, 0);

  const recommendationRows = db
    .select({
      status: recommendations.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(recommendations)
    .groupBy(recommendations.status)
    .all();
  const recommendationCounters = new Map(
    recommendationRows.map((row) => [row.status, row.count]),
  );

  return {
    window,
    totals: {
      impressions,
      clicks,
      ctr: safeCtr(clicks, impressions),
      eventsProcessed: totals,
    },
    recommendations: {
      draft: recommendationCounters.get("draft") ?? 0,
      approved: recommendationCounters.get("approved") ?? 0,
      running: recommendationCounters.get("running") ?? 0,
      completed: recommendationCounters.get("completed") ?? 0,
      stopped: recommendationCounters.get("stopped") ?? 0,
    },
  };
}

export function getSlotSummaries(
  window: TimeWindow,
  options: { segmentKey?: string; limit?: number } = {},
): SlotSummary[] {
  const where = telemetryWhere(window, options.segmentKey);
  const rows = db
    .select({
      slotKey: telemetryEvents.slotKey,
      variant: telemetryEvents.variant,
      eventType: telemetryEvents.eventType,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(telemetryEvents)
    .where(where)
    .groupBy(
      telemetryEvents.slotKey,
      telemetryEvents.variant,
      telemetryEvents.eventType,
    )
    .all();

  const slotMap = new Map<
    string,
    {
      impressions: number;
      clicks: number;
      variantImpressions: Map<string, number>;
    }
  >();

  for (const row of rows) {
    if (!slotMap.has(row.slotKey)) {
      slotMap.set(row.slotKey, {
        impressions: 0,
        clicks: 0,
        variantImpressions: new Map(),
      });
    }
    const slot = slotMap.get(row.slotKey)!;
    if (row.eventType === "impression") {
      slot.impressions += row.count;
      slot.variantImpressions.set(
        row.variant,
        (slot.variantImpressions.get(row.variant) ?? 0) + row.count,
      );
    }
    if (row.eventType === "click") {
      slot.clicks += row.count;
    }
  }

  const result: SlotSummary[] = [];
  for (const [slotKey, slot] of slotMap.entries()) {
    let topVariant: string | null = null;
    let topCount = 0;
    let secondCount = 0;
    for (const [variant, count] of slot.variantImpressions.entries()) {
      if (count > topCount) {
        secondCount = topCount;
        topCount = count;
        topVariant = variant;
      } else if (count > secondCount) {
        secondCount = count;
      }
    }

    result.push({
      slotKey,
      impressions: slot.impressions,
      clicks: slot.clicks,
      ctr: safeCtr(slot.clicks, slot.impressions),
      topVariant,
      confidenceSpread: safeCtr(topCount - secondCount, Math.max(topCount, 1)),
    });
  }

  result.sort((a, b) => b.impressions - a.impressions);
  return result.slice(0, options.limit ?? 50);
}

export function getSlotVariantSeries(
  slotKey: string,
  window: TimeWindow,
  options: { segmentKey?: string; bucket?: Bucket } = {},
): SlotVariantSeries[] {
  const bucket = options.bucket ?? "day";
  const bucketExpr =
    bucket === "hour"
      ? sql<string>`strftime('%Y-%m-%dT%H:00:00Z', ${telemetryEvents.createdAt})`
      : sql<string>`strftime('%Y-%m-%d', ${telemetryEvents.createdAt})`;

  const rows = db
    .select({
      bucket: bucketExpr,
      variant: telemetryEvents.variant,
      eventType: telemetryEvents.eventType,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(telemetryEvents)
    .where(
      and(telemetryWhere(window, options.segmentKey), eq(telemetryEvents.slotKey, slotKey)),
    )
    .groupBy(bucketExpr, telemetryEvents.variant, telemetryEvents.eventType)
    .orderBy(bucketExpr)
    .all();

  const map = new Map<string, Map<string, { impressions: number; clicks: number }>>();
  for (const row of rows) {
    if (!map.has(row.variant)) {
      map.set(row.variant, new Map());
    }
    const byTime = map.get(row.variant)!;
    if (!byTime.has(row.bucket)) {
      byTime.set(row.bucket, { impressions: 0, clicks: 0 });
    }
    const point = byTime.get(row.bucket)!;
    if (row.eventType === "impression") point.impressions += row.count;
    if (row.eventType === "click") point.clicks += row.count;
  }

  const series: SlotVariantSeries[] = [];
  for (const [variant, points] of map.entries()) {
    const sortedPoints = [...points.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([t, values]) => ({
        t,
        impressions: values.impressions,
        clicks: values.clicks,
        ctr: safeCtr(values.clicks, values.impressions),
      }));
    series.push({ variant, points: sortedPoints });
  }

  series.sort((a, b) => a.variant.localeCompare(b.variant));
  return series;
}

export function getCrossSlotInsights(limit = 20): CrossSlotInsight[] {
  const rows = db
    .select({
      userId: userPreferences.userId,
      slotKey: userPreferences.slotKey,
      variant: userPreferences.resolvedVariant,
    })
    .from(userPreferences)
    .all();

  const byUser = new Map<string, Array<{ slotKey: string; variant: string }>>();
  for (const row of rows) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId)!.push({ slotKey: row.slotKey, variant: row.variant });
  }

  const pairCounts = new Map<string, number>();
  for (const userRows of byUser.values()) {
    for (let i = 0; i < userRows.length; i++) {
      for (let j = i + 1; j < userRows.length; j++) {
        const left = userRows[i]!;
        const right = userRows[j]!;
        const [a, b] =
          left.slotKey <= right.slotKey ? [left, right] : [right, left];
        const key = `${a.slotKey}::${a.variant}||${b.slotKey}::${b.variant}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  return [...pairCounts.entries()]
    .map(([key, count]) => {
      const [left, right] = key.split("||");
      const [slotA, variantA] = left.split("::");
      const [slotB, variantB] = right.split("::");
      return {
        slotA,
        variantA,
        slotB,
        variantB,
        count,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function telemetryWhere(window: TimeWindow, segmentKey?: string) {
  const clauses = [
    gte(telemetryEvents.createdAt, window.from),
    lte(telemetryEvents.createdAt, window.to),
  ];

  if (segmentKey) {
    clauses.push(
      sql`json_extract(coalesce(${telemetryEvents.metadata}, '{}'), '$.segmentKey') = ${segmentKey}`,
    );
  }

  return and(...clauses);
}

function safeCtr(clicks: number, impressions: number): number {
  if (impressions <= 0) return 0;
  return clicks / impressions;
}
