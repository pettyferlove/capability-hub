CREATE TABLE `ai_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_id')) STORED NOT NULL,
	`execution_id` text GENERATED ALWAYS AS (json_extract(data, '$.execution_id')) STORED NOT NULL,
	`lookup_key` text GENERATED ALWAYS AS (json_extract(data, '$.lookup_key')) STORED NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`updated_at` text GENERATED ALWAYS AS (json_extract(data, '$.updated_at')) STORED NOT NULL,
	`position` integer GENERATED ALWAYS AS (json_extract(data, '$.position')) STORED NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `ai_executions`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ai_artifacts_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_artifacts_execution_position_idx` ON `ai_artifacts` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_artifacts_owner_position_idx` ON `ai_artifacts` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_artifacts_lookup_position_idx` ON `ai_artifacts` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_artifacts_status_position_idx` ON `ai_artifacts` (`status`,`position`,`id`);--> statement-breakpoint
CREATE TABLE `ai_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_id')) STORED NOT NULL,
	`execution_id` text GENERATED ALWAYS AS (json_extract(data, '$.execution_id')) STORED NOT NULL,
	`lookup_key` text GENERATED ALWAYS AS (json_extract(data, '$.lookup_key')) STORED NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`updated_at` text GENERATED ALWAYS AS (json_extract(data, '$.updated_at')) STORED NOT NULL,
	`position` integer GENERATED ALWAYS AS (json_extract(data, '$.position')) STORED NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `ai_executions`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ai_calls_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_calls_execution_position_idx` ON `ai_calls` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_calls_owner_position_idx` ON `ai_calls` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_calls_lookup_position_idx` ON `ai_calls` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_calls_status_position_idx` ON `ai_calls` (`status`,`position`,`id`);--> statement-breakpoint
CREATE TABLE `ai_effects` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_id')) STORED NOT NULL,
	`execution_id` text GENERATED ALWAYS AS (json_extract(data, '$.execution_id')) STORED NOT NULL,
	`lookup_key` text GENERATED ALWAYS AS (json_extract(data, '$.lookup_key')) STORED NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`updated_at` text GENERATED ALWAYS AS (json_extract(data, '$.updated_at')) STORED NOT NULL,
	`position` integer GENERATED ALWAYS AS (json_extract(data, '$.position')) STORED NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `ai_executions`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ai_effects_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_effects_execution_position_idx` ON `ai_effects` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_effects_owner_position_idx` ON `ai_effects` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_effects_lookup_position_idx` ON `ai_effects` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_effects_status_position_idx` ON `ai_effects` (`status`,`position`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_effects_lookup_uq` ON `ai_effects` (`lookup_key`);--> statement-breakpoint
CREATE TABLE `ai_events` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_id')) STORED NOT NULL,
	`execution_id` text GENERATED ALWAYS AS (json_extract(data, '$.execution_id')) STORED NOT NULL,
	`lookup_key` text GENERATED ALWAYS AS (json_extract(data, '$.lookup_key')) STORED NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`updated_at` text GENERATED ALWAYS AS (json_extract(data, '$.updated_at')) STORED NOT NULL,
	`position` integer GENERATED ALWAYS AS (json_extract(data, '$.position')) STORED NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `ai_executions`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ai_events_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_events_execution_position_idx` ON `ai_events` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_events_owner_position_idx` ON `ai_events` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_events_lookup_position_idx` ON `ai_events` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_events_status_position_idx` ON `ai_events` (`status`,`position`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_events_stream_seq_uq` ON `ai_events` (`lookup_key`,`position`);--> statement-breakpoint
CREATE TABLE `ai_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_id')) STORED NOT NULL,
	`execution_id` text GENERATED ALWAYS AS (json_extract(data, '$.execution_id')) STORED NOT NULL,
	`lookup_key` text GENERATED ALWAYS AS (json_extract(data, '$.lookup_key')) STORED NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`updated_at` text GENERATED ALWAYS AS (json_extract(data, '$.updated_at')) STORED NOT NULL,
	`position` integer GENERATED ALWAYS AS (json_extract(data, '$.position')) STORED NOT NULL,
	CONSTRAINT "ai_executions_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_executions_execution_position_idx` ON `ai_executions` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_executions_owner_position_idx` ON `ai_executions` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_executions_lookup_position_idx` ON `ai_executions` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_executions_status_position_idx` ON `ai_executions` (`status`,`position`,`id`);--> statement-breakpoint
CREATE TABLE `ai_interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_id')) STORED NOT NULL,
	`execution_id` text GENERATED ALWAYS AS (json_extract(data, '$.execution_id')) STORED NOT NULL,
	`lookup_key` text GENERATED ALWAYS AS (json_extract(data, '$.lookup_key')) STORED NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`updated_at` text GENERATED ALWAYS AS (json_extract(data, '$.updated_at')) STORED NOT NULL,
	`position` integer GENERATED ALWAYS AS (json_extract(data, '$.position')) STORED NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `ai_executions`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ai_interactions_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_interactions_execution_position_idx` ON `ai_interactions` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_interactions_owner_position_idx` ON `ai_interactions` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_interactions_lookup_position_idx` ON `ai_interactions` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_interactions_status_position_idx` ON `ai_interactions` (`status`,`position`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_interactions_lookup_uq` ON `ai_interactions` (`lookup_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_interactions_pending_uq` ON `ai_interactions` (`execution_id`) WHERE "ai_interactions"."status" = 'pending';--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_id')) STORED NOT NULL,
	`execution_id` text GENERATED ALWAYS AS (json_extract(data, '$.execution_id')) STORED NOT NULL,
	`lookup_key` text GENERATED ALWAYS AS (json_extract(data, '$.lookup_key')) STORED NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`updated_at` text GENERATED ALWAYS AS (json_extract(data, '$.updated_at')) STORED NOT NULL,
	`position` integer GENERATED ALWAYS AS (json_extract(data, '$.position')) STORED NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `ai_executions`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ai_messages_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_messages_execution_position_idx` ON `ai_messages` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_messages_owner_position_idx` ON `ai_messages` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_messages_lookup_position_idx` ON `ai_messages` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_messages_status_position_idx` ON `ai_messages` (`status`,`position`,`id`);--> statement-breakpoint
CREATE TABLE `ai_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_id')) STORED NOT NULL,
	`execution_id` text GENERATED ALWAYS AS (json_extract(data, '$.execution_id')) STORED NOT NULL,
	`lookup_key` text GENERATED ALWAYS AS (json_extract(data, '$.lookup_key')) STORED NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`updated_at` text GENERATED ALWAYS AS (json_extract(data, '$.updated_at')) STORED NOT NULL,
	`position` integer GENERATED ALWAYS AS (json_extract(data, '$.position')) STORED NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `ai_executions`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ai_snapshots_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_snapshots_execution_position_idx` ON `ai_snapshots` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_snapshots_owner_position_idx` ON `ai_snapshots` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_snapshots_lookup_position_idx` ON `ai_snapshots` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_snapshots_status_position_idx` ON `ai_snapshots` (`status`,`position`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_snapshots_lookup_uq` ON `ai_snapshots` (`lookup_key`);--> statement-breakpoint
CREATE TABLE `ai_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_id')) STORED NOT NULL,
	`execution_id` text GENERATED ALWAYS AS (json_extract(data, '$.execution_id')) STORED NOT NULL,
	`lookup_key` text GENERATED ALWAYS AS (json_extract(data, '$.lookup_key')) STORED NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`updated_at` text GENERATED ALWAYS AS (json_extract(data, '$.updated_at')) STORED NOT NULL,
	`position` integer GENERATED ALWAYS AS (json_extract(data, '$.position')) STORED NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `ai_executions`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ai_threads_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_threads_execution_position_idx` ON `ai_threads` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_threads_owner_position_idx` ON `ai_threads` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_threads_lookup_position_idx` ON `ai_threads` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_threads_status_position_idx` ON `ai_threads` (`status`,`position`,`id`);--> statement-breakpoint
CREATE TABLE `ai_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_id')) STORED NOT NULL,
	`execution_id` text GENERATED ALWAYS AS (json_extract(data, '$.execution_id')) STORED NOT NULL,
	`lookup_key` text GENERATED ALWAYS AS (json_extract(data, '$.lookup_key')) STORED NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`updated_at` text GENERATED ALWAYS AS (json_extract(data, '$.updated_at')) STORED NOT NULL,
	`position` integer GENERATED ALWAYS AS (json_extract(data, '$.position')) STORED NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `ai_executions`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "ai_traces_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_traces_execution_position_idx` ON `ai_traces` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_traces_owner_position_idx` ON `ai_traces` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_traces_lookup_position_idx` ON `ai_traces` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_traces_status_position_idx` ON `ai_traces` (`status`,`position`,`id`);