CREATE TABLE `api_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `design_system_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_order` integer NOT NULL,
	`chunk_text` text NOT NULL,
	`metadata` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `design_system_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_system_chunks_doc_order_unique` ON `design_system_chunks` (`document_id`,`chunk_order`);--> statement-breakpoint
CREATE INDEX `design_system_chunks_document_idx` ON `design_system_chunks` (`document_id`);--> statement-breakpoint
CREATE TABLE `design_system_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_path` text NOT NULL,
	`component_id` text,
	`version_tag` text,
	`checksum` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_system_documents_source_ver_unique` ON `design_system_documents` (`source_path`,`version_tag`,`project_id`);--> statement-breakpoint
CREATE INDEX `design_system_documents_component_idx` ON `design_system_documents` (`component_id`);--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`rollout_percent` integer NOT NULL,
	`duration_days` integer NOT NULL,
	`result_json` text,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`end_at` text,
	`stopped_at` text,
	`stop_reason` text,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `experiments_recommendation_unique` ON `experiments` (`recommendation_id`);--> statement-breakpoint
CREATE INDEX `experiments_status_idx` ON `experiments` (`status`);--> statement-breakpoint
CREATE TABLE `knowledge_index_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source` text NOT NULL,
	`paths` text NOT NULL,
	`version_tag` text,
	`status` text NOT NULL,
	`documents_indexed` integer DEFAULT 0 NOT NULL,
	`chunks_indexed` integer DEFAULT 0 NOT NULL,
	`failed_documents` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `layout_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`slot_assignments` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`stripe_customer_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recommendation_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_ref` text NOT NULL,
	`quote_excerpt` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recommendation_citations_reco_idx` ON `recommendation_citations` (`recommendation_id`);--> statement-breakpoint
CREATE TABLE `recommendation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`trigger_type` text NOT NULL,
	`status` text NOT NULL,
	`slot_keys` text,
	`segment_keys` text,
	`window_from` text,
	`window_to` text,
	`summary` text,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`slot_key` text NOT NULL,
	`segment_key` text NOT NULL,
	`current_variant` text NOT NULL,
	`recommended_variant` text NOT NULL,
	`expected_impact` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`risk_level` text NOT NULL,
	`rationale_text` text NOT NULL,
	`experiment_plan` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`rejected_by` text,
	`rejected_reason` text,
	`rejected_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `recommendation_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recommendations_status_idx` ON `recommendations` (`status`);--> statement-breakpoint
CREATE INDEX `recommendations_slot_segment_idx` ON `recommendations` (`slot_key`,`segment_key`);--> statement-breakpoint
CREATE TABLE `slot_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`slot_key` text NOT NULL,
	`description` text,
	`variants` text NOT NULL,
	`default_variant` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slot_definitions_key_project_unique` ON `slot_definitions` (`slot_key`,`project_id`);--> statement-breakpoint
CREATE TABLE `telemetry_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`slot_key` text NOT NULL,
	`variant` text NOT NULL,
	`event_type` text NOT NULL,
	`metadata` text,
	`processed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `telemetry_events_processed_at_idx` ON `telemetry_events` (`processed_at`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`slot_key` text NOT NULL,
	`variant_weights` text NOT NULL,
	`resolved_variant` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_preferences_user_slot_unique` ON `user_preferences` (`user_id`,`slot_key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_project_unique` ON `users` (`email`,`project_id`);