CREATE TABLE `ai_exchanges` (
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
	CONSTRAINT "ai_exchanges_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `ai_exchanges_execution_position_idx` ON `ai_exchanges` (`execution_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_exchanges_owner_position_idx` ON `ai_exchanges` (`owner_id`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_exchanges_lookup_position_idx` ON `ai_exchanges` (`lookup_key`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `ai_exchanges_status_position_idx` ON `ai_exchanges` (`status`,`position`,`id`);