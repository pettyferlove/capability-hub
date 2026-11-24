CREATE TABLE `evaluation_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`window_start` integer GENERATED ALWAYS AS (json_extract(data, '$.window_start')) STORED NOT NULL,
	`reserved` integer GENERATED ALWAYS AS (json_extract(data, '$.reserved')) STORED NOT NULL,
	CONSTRAINT "evaluation_schedule_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id) IS 1),
	CONSTRAINT "evaluation_schedule_singleton" CHECK(id = 'resource-evaluations')
) STRICT;
--> statement-breakpoint
CREATE TABLE `resource_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`asset_id` text GENERATED ALWAYS AS (json_extract(data, '$.asset_id')) STORED NOT NULL,
	`version_id` text GENERATED ALWAYS AS (json_extract(data, '$.version_id')) STORED NOT NULL,
	`state` text GENERATED ALWAYS AS (json_extract(data, '$.state')) STORED NOT NULL,
	`priority` integer GENERATED ALWAYS AS (json_extract(data, '$.priority')) STORED NOT NULL,
	`requested_at` text GENERATED ALWAYS AS (json_extract(data, '$.requested_at')) STORED NOT NULL,
	`rubric_version` text GENERATED ALWAYS AS (json_extract(data, '$.rubric_version')) STORED NOT NULL,
	`subject_digest` text GENERATED ALWAYS AS (json_extract(data, '$.subject_digest')) STORED NOT NULL,
	`evaluator_digest` text GENERATED ALWAYS AS (json_extract(data, '$.evaluator_digest')) STORED,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "resource_evaluations_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `evaluations_queue` ON `resource_evaluations` (`state`,priority DESC,`requested_at`,`id`);
--> statement-breakpoint
CREATE INDEX `evaluations_version` ON `resource_evaluations` (`version_id`,`rubric_version`);
--> statement-breakpoint
CREATE INDEX `evaluations_reuse` ON `resource_evaluations` (`subject_digest`,`rubric_version`) WHERE state = 'succeeded';
--> statement-breakpoint
CREATE UNIQUE INDEX `evaluations_active_subject` ON `resource_evaluations` (`version_id`,`subject_digest`,`rubric_version`,coalesce(evaluator_digest, '')) WHERE state in ('queued','running');
--> statement-breakpoint
CREATE TRIGGER evaluation_terminal_immutable BEFORE UPDATE ON resource_evaluations
WHEN OLD.state IN ('succeeded', 'partial', 'failed', 'cancelled')
BEGIN
  SELECT RAISE(ABORT, 'terminal evaluation immutable');
END;
