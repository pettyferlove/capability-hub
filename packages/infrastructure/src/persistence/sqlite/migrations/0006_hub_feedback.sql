CREATE TABLE `hub_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`number` integer GENERATED ALWAYS AS (json_extract(data, '$.number')) STORED NOT NULL,
	`submitted_by` text GENERATED ALWAYS AS (json_extract(data, '$.submitted_by')) STORED NOT NULL,
	`channel` text GENERATED ALWAYS AS (json_extract(data, '$.channel')) STORED NOT NULL,
	`kind` text GENERATED ALWAYS AS (json_extract(data, '$.kind')) STORED NOT NULL,
	`surface` text GENERATED ALWAYS AS (json_extract(data, '$.surface')) STORED NOT NULL,
	`area` text GENERATED ALWAYS AS (json_extract(data, '$.area')) STORED,
	`status` text GENERATED ALWAYS AS (json_extract(data, '$.status')) STORED NOT NULL,
	`blocking` integer GENERATED ALWAYS AS (json_extract(data, '$.blocking')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	`closed_at` text GENERATED ALWAYS AS (json_extract(data, '$.closed_at')) STORED,
	`last_activity_at` text GENERATED ALWAYS AS (json_extract(data, '$.last_activity_at')) STORED NOT NULL,
	`last_handler_public_at` text GENERATED ALWAYS AS (json_extract(data, '$.last_handler_public_at')) STORED,
	`submitter_seen_at` text GENERATED ALWAYS AS (json_extract(data, '$.submitter_seen_at')) STORED NOT NULL,
	`assignee_id` text GENERATED ALWAYS AS (json_extract(data, '$.assignee_id')) STORED,
	`duplicate_of_id` text GENERATED ALWAYS AS (json_extract(data, '$.duplicate_of_id')) STORED,
	`awaiting_reply` integer GENERATED ALWAYS AS (((data ->> 'last_handler_public_at') IS NULL OR (data ->> 'last_handler_public_at') < (data ->> 'last_submitter_activity_at'))
        AND ((data ->> 'closed_at') IS NULL OR (data ->> 'last_submitter_activity_at') > (data ->> 'closed_at'))) STORED,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	FOREIGN KEY (`duplicate_of_id`) REFERENCES `hub_feedback`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "hub_feedback_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id) IS 1),
	CONSTRAINT "hub_feedback_number_positive" CHECK(number > 0)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_feedback_number_unique` ON `hub_feedback` (`number`);--> statement-breakpoint
CREATE INDEX `hub_feedback_submitter_created` ON `hub_feedback` (`submitted_by`,`created_at`);--> statement-breakpoint
CREATE INDEX `hub_feedback_submitter_order` ON `hub_feedback` (`submitted_by`,`last_activity_at`,`number`);--> statement-breakpoint
CREATE INDEX `hub_feedback_queue` ON `hub_feedback` (`blocking`,`last_activity_at`,`number`);--> statement-breakpoint
CREATE INDEX `hub_feedback_status_queue` ON `hub_feedback` (`status`,`blocking`,`last_activity_at`,`number`);--> statement-breakpoint
CREATE INDEX `hub_feedback_assignee` ON `hub_feedback` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `hub_feedback_closed` ON `hub_feedback` (`closed_at`);--> statement-breakpoint
CREATE TABLE `hub_feedback_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`feedback_id` text GENERATED ALWAYS AS (json_extract(data, '$.feedback_id')) STORED NOT NULL,
	`event_id` text GENERATED ALWAYS AS (json_extract(data, '$.event_id')) STORED,
	`uploaded_by` text GENERATED ALWAYS AS (json_extract(data, '$.uploaded_by')) STORED NOT NULL,
	`removed_by` text GENERATED ALWAYS AS (json_extract(data, '$.removed_by')) STORED,
	`sha256` text GENERATED ALWAYS AS (json_extract(data, '$.sha256')) STORED,
	`size` integer GENERATED ALWAYS AS (json_extract(data, '$.size')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `hub_feedback`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	FOREIGN KEY (`feedback_id`,`event_id`) REFERENCES `hub_feedback_events`(`feedback_id`,`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	FOREIGN KEY (`removed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "hub_feedback_attachments_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `hub_feedback_attachments_order` ON `hub_feedback_attachments` (`feedback_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `hub_feedback_attachments_active` ON `hub_feedback_attachments` (`feedback_id`) WHERE sha256 IS NOT NULL;--> statement-breakpoint
CREATE TABLE `hub_feedback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`feedback_id` text GENERATED ALWAYS AS (json_extract(data, '$.feedback_id')) STORED NOT NULL,
	`sequence` integer GENERATED ALWAYS AS (json_extract(data, '$.sequence')) STORED NOT NULL,
	`kind` text GENERATED ALWAYS AS (json_extract(data, '$.kind')) STORED NOT NULL,
	`actor_id` text GENERATED ALWAYS AS (json_extract(data, '$.actor_id')) STORED,
	`visibility` text GENERATED ALWAYS AS (json_extract(data, '$.visibility')) STORED NOT NULL,
	`created_at` text GENERATED ALWAYS AS (json_extract(data, '$.created_at')) STORED NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `hub_feedback`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "hub_feedback_events_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id) IS 1),
	CONSTRAINT "hub_feedback_events_sequence_positive" CHECK(sequence > 0)
) STRICT;
--> statement-breakpoint
CREATE INDEX `hub_feedback_events_visibility` ON `hub_feedback_events` (`feedback_id`,`visibility`,`sequence`);--> statement-breakpoint
CREATE INDEX `hub_feedback_events_actor_created` ON `hub_feedback_events` (`actor_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `hub_feedback_events_feedback_id_sequence_unique` ON `hub_feedback_events` (`feedback_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `hub_feedback_events_feedback_id_id_unique` ON `hub_feedback_events` (`feedback_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER hub_feedback_immutable
BEFORE UPDATE ON hub_feedback
WHEN NEW.id IS NOT OLD.id
  OR (NEW.data ->> 'number') IS NOT (OLD.data ->> 'number')
  OR (NEW.data ->> 'submitted_by') IS NOT (OLD.data ->> 'submitted_by')
  OR (NEW.data ->> 'channel') IS NOT (OLD.data ->> 'channel')
  OR (NEW.data ->> 'created_at') IS NOT (OLD.data ->> 'created_at')
BEGIN
  SELECT RAISE(ABORT, 'hub feedback identity is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER hub_feedback_events_immutable
BEFORE UPDATE ON hub_feedback_events
WHEN NEW.id IS NOT OLD.id
  OR json_type(OLD.data, '$.redacted_at') IS NOT 'null'
  OR (NEW.data ->> 'body') IS NOT ''
  OR json_type(NEW.data, '$.redacted_at') IS NOT 'text'
  OR EXISTS (
    SELECT fullkey, type, atom FROM (
      SELECT fullkey, type, atom, 1 AS delta FROM json_tree(json_remove(OLD.data, '$.body', '$.redacted_at'))
      UNION ALL
      SELECT fullkey, type, atom, -1 AS delta FROM json_tree(json_remove(NEW.data, '$.body', '$.redacted_at'))
    ) GROUP BY fullkey, type, atom HAVING sum(delta) <> 0
  )
BEGIN
  SELECT RAISE(ABORT, 'hub feedback event is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER hub_feedback_attachments_immutable
BEFORE UPDATE ON hub_feedback_attachments
WHEN NEW.id IS NOT OLD.id
  OR json_type(OLD.data, '$.sha256') IS NOT 'text'
  OR json_type(NEW.data, '$.sha256') IS NOT 'null'
  OR json_type(NEW.data, '$.removed_at') IS NOT 'text'
  OR coalesce(NEW.data ->> 'removal_reason', '') NOT IN ('submitter', 'handler', 'retention')
  OR EXISTS (
    SELECT fullkey, type, atom FROM (
      SELECT fullkey, type, atom, 1 AS delta FROM json_tree(json_remove(OLD.data, '$.sha256', '$.removed_at', '$.removed_by', '$.removal_reason'))
      UNION ALL
      SELECT fullkey, type, atom, -1 AS delta FROM json_tree(json_remove(NEW.data, '$.sha256', '$.removed_at', '$.removed_by', '$.removal_reason'))
    ) GROUP BY fullkey, type, atom HAVING sum(delta) <> 0
  )
BEGIN
  SELECT RAISE(ABORT, 'hub feedback attachment is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER hub_feedback_no_delete
BEFORE DELETE ON hub_feedback
BEGIN
  SELECT RAISE(ABORT, 'hub feedback rows cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER hub_feedback_events_no_delete
BEFORE DELETE ON hub_feedback_events
BEGIN
  SELECT RAISE(ABORT, 'hub feedback rows cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER hub_feedback_attachments_no_delete
BEFORE DELETE ON hub_feedback_attachments
BEGIN
  SELECT RAISE(ABORT, 'hub feedback rows cannot be deleted');
END;