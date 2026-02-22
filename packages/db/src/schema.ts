import {
  sqliteTable,
  text,
  index,
  uniqueIndex,
  integer,
  real,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const apiKeys = sqliteTable("api_keys", {
  key: text("key").primaryKey(), // The actual API key (e.g. pk_live_...)
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  name: text("name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    emailProjectUnique: uniqueIndex("users_email_project_unique").on(
      table.email,
      table.projectId
    ),
  })
);

export const slotDefinitions = sqliteTable("slot_definitions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  slotKey: text("slot_key").notNull(),
  description: text("description"),
  variants: text("variants").notNull(), // JSON array: ["minimal","image-heavy","video"]
  defaultVariant: text("default_variant").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => ({
  slotKeyProjectUnique: uniqueIndex("slot_definitions_key_project_unique").on(
    table.slotKey,
    table.projectId
  ),
}));

export const layoutConfigs = sqliteTable("layout_configs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  name: text("name").notNull(),
  slotAssignments: text("slot_assignments").notNull(), // JSON: { "hero-banner": "image-heavy", ... }
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const userPreferences = sqliteTable(
  "user_preferences",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    slotKey: text("slot_key").notNull(),
    variantWeights: text("variant_weights").notNull(), // JSON: { "minimal": 0.2, "image-heavy": 0.7 }
    resolvedVariant: text("resolved_variant").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    userSlotUnique: uniqueIndex("user_preferences_user_slot_unique").on(
      table.userId,
      table.slotKey,
    ),
  }),
);

export const telemetryEvents = sqliteTable(
  "telemetry_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    slotKey: text("slot_key").notNull(),
    variant: text("variant").notNull(),
    eventType: text("event_type").notNull(), // "impression" | "click" | "dismiss" | "hover" | "scroll"
    metadata: text("metadata"), // optional JSON
    processedAt: text("processed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    processedAtIdx: index("telemetry_events_processed_at_idx").on(
      table.processedAt,
    ),
  }),
);

export const knowledgeIndexJobs = sqliteTable("knowledge_index_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  source: text("source").notNull(),
  paths: text("paths").notNull(), // JSON string array
  versionTag: text("version_tag"),
  status: text("status").notNull(), // queued | running | completed | failed
  documentsIndexed: integer("documents_indexed").notNull().default(0),
  chunksIndexed: integer("chunks_indexed").notNull().default(0),
  failedDocuments: integer("failed_documents").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: text("started_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  finishedAt: text("finished_at"),
});

export const designSystemDocuments = sqliteTable(
  "design_system_documents",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    sourceType: text("source_type").notNull(),
    sourcePath: text("source_path").notNull(),
    componentId: text("component_id"),
    versionTag: text("version_tag"),
    checksum: text("checksum").notNull(),
    content: text("content").notNull(),
    metadata: text("metadata"), // JSON object
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    sourceVersionUnique: uniqueIndex("design_system_documents_source_ver_unique").on(
      table.sourcePath,
      table.versionTag,
      table.projectId
    ),
    componentIdx: index("design_system_documents_component_idx").on(
      table.componentId,
    ),
  }),
);

export const designSystemChunks = sqliteTable(
  "design_system_chunks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => designSystemDocuments.id),
    chunkOrder: integer("chunk_order").notNull(),
    chunkText: text("chunk_text").notNull(),
    metadata: text("metadata"), // JSON object
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    documentOrderUnique: uniqueIndex("design_system_chunks_doc_order_unique").on(
      table.documentId,
      table.chunkOrder,
    ),
    documentIdx: index("design_system_chunks_document_idx").on(table.documentId),
  }),
);

export const recommendationRuns = sqliteTable("recommendation_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  triggerType: text("trigger_type").notNull(), // manual | scheduled
  status: text("status").notNull(), // completed | failed
  slotKeys: text("slot_keys"), // JSON string array
  segmentKeys: text("segment_keys"), // JSON string array
  windowFrom: text("window_from"),
  windowTo: text("window_to"),
  summary: text("summary"), // JSON object
  startedAt: text("started_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  finishedAt: text("finished_at"),
});

export const recommendations = sqliteTable(
  "recommendations",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => recommendationRuns.id),
    slotKey: text("slot_key").notNull(),
    segmentKey: text("segment_key").notNull(),
    currentVariant: text("current_variant").notNull(),
    recommendedVariant: text("recommended_variant").notNull(),
    expectedImpact: text("expected_impact"), // JSON object
    confidence: real("confidence").notNull().default(0),
    riskLevel: text("risk_level").notNull(), // low | medium | high
    rationaleText: text("rationale_text").notNull(),
    experimentPlan: text("experiment_plan"), // JSON object
    status: text("status").notNull().default("draft"), // draft | approved | rejected | running | completed | stopped
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    rejectedBy: text("rejected_by"),
    rejectedReason: text("rejected_reason"),
    rejectedAt: text("rejected_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    statusIdx: index("recommendations_status_idx").on(table.status),
    slotSegmentIdx: index("recommendations_slot_segment_idx").on(
      table.slotKey,
      table.segmentKey,
    ),
  }),
);

export const recommendationCitations = sqliteTable(
  "recommendation_citations",
  {
    id: text("id").primaryKey(),
    recommendationId: text("recommendation_id")
      .notNull()
      .references(() => recommendations.id),
    sourceType: text("source_type").notNull(),
    sourceRef: text("source_ref").notNull(),
    quoteExcerpt: text("quote_excerpt"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    recommendationIdx: index("recommendation_citations_reco_idx").on(
      table.recommendationId,
    ),
  }),
);

export const experiments = sqliteTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    recommendationId: text("recommendation_id")
      .notNull()
      .references(() => recommendations.id),
    status: text("status").notNull().default("running"), // running | stopped | completed
    rolloutPercent: integer("rollout_percent").notNull(),
    durationDays: integer("duration_days").notNull(),
    resultJson: text("result_json"), // JSON object
    startedAt: text("started_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    endAt: text("end_at"),
    stoppedAt: text("stopped_at"),
    stopReason: text("stop_reason"),
  },
  (table) => ({
    recommendationUnique: uniqueIndex("experiments_recommendation_unique").on(
      table.recommendationId,
    ),
    statusIdx: index("experiments_status_idx").on(table.status),
  }),
);
