CREATE TABLE `asset_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`asset_id` text GENERATED ALWAYS AS (json_extract(data, '$.asset_id')) STORED NOT NULL,
	`version_id` text GENERATED ALWAYS AS (json_extract(data, '$.version_id')) STORED NOT NULL,
	`submitted_by` text GENERATED ALWAYS AS (json_extract(data, '$.submitted_by')) STORED NOT NULL,
	`request_key` text GENERATED ALWAYS AS (json_extract(data, '$.request_key')) STORED NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "asset_feedback_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `asset_feedback_asset` ON `asset_feedback` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_feedback_submitted_by_request_key_unique` ON `asset_feedback` (`submitted_by`,`request_key`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`slug` text GENERATED ALWAYS AS (json_extract(data, '$.slug')) STORED NOT NULL,
	`source_id` text GENERATED ALWAYS AS (json_extract(data, '$.source_id')) STORED,
	`owner_group_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_group_id')) STORED,
	`current_release_id` text GENERATED ALWAYS AS (json_extract(data, '$.current_release_id')) STORED,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`id`,`current_release_id`) REFERENCES `releases`(`asset_id`,`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "assets_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_slug_unique` ON `assets` (`slug`);--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`occurred_at` text GENERATED ALWAYS AS (json_extract(data, '$.occurred_at')) STORED NOT NULL,
	CONSTRAINT "audit_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`source_id` text GENERATED ALWAYS AS (json_extract(data, '$.source_id')) STORED,
	`asset_id` text GENERATED ALWAYS AS (json_extract(data, '$.asset_id')) STORED,
	`path` text GENERATED ALWAYS AS (json_extract(data, '$.path')) STORED,
	`retired_at` text GENERATED ALWAYS AS (json_extract(data, '$.retired_at')) STORED,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bindings_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `binding_asset` ON `bindings` (`asset_id`) WHERE retired_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `binding_path` ON `bindings` (`source_id`,`path`) WHERE retired_at IS NULL;--> statement-breakpoint
CREATE TABLE `cli_logins` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`code` text GENERATED ALWAYS AS (json_extract(data, '$.code')) STORED,
	CONSTRAINT "cli_logins_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_logins_code_unique` ON `cli_logins` (`code`);--> statement-breakpoint
CREATE TABLE `git_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`user_id` text GENERATED ALWAYS AS (json_extract(data, '$.user_id')) STORED,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "git_credentials_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`name` text GENERATED ALWAYS AS (json_extract(data, '$.name')) STORED NOT NULL,
	CONSTRAINT "groups_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_name_unique` ON `groups` (`name`);--> statement-breakpoint
CREATE TABLE `hub_revision` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "hub_revision_id_check" CHECK(id = 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `idempotency` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`principal_id` text GENERATED ALWAYS AS (json_extract(data, '$.principal_id')) STORED,
	`route` text GENERATED ALWAYS AS (json_extract(data, '$.route')) STORED,
	`KEY` text GENERATED ALWAYS AS (json_extract(data, '$.key')) STORED,
	FOREIGN KEY (`principal_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "idempotency_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_principal_id_route_KEY_unique` ON `idempotency` (`principal_id`,`route`,`KEY`);--> statement-breakpoint
CREATE TABLE `intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`asset_id` text GENERATED ALWAYS AS (json_extract(data, '$.asset_id')) STORED,
	`source_id` text GENERATED ALWAYS AS (json_extract(data, '$.source_id')) STORED,
	`binding_id` text GENERATED ALWAYS AS (json_extract(data, '$.binding_id')) STORED,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`binding_id`) REFERENCES `bindings`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "intakes_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `intake_asset` ON `intakes` (`asset_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`state` text GENERATED ALWAYS AS (json_extract(data, '$.state')) STORED,
	`run_after` integer GENERATED ALWAYS AS (json_extract(data, '$.run_after')) STORED,
	`aggregate_id` text GENERATED ALWAYS AS (json_extract(data, '$.aggregate_id')) STORED NOT NULL,
	CONSTRAINT "jobs_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `jobs_schedule` ON `jobs` (`state`,`run_after`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`window_expires_at` integer GENERATED ALWAYS AS (json_extract(data, '$.window_expires_at')) STORED NOT NULL,
	CONSTRAINT "login_attempts_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`user_id` text GENERATED ALWAYS AS (json_extract(data, '$.user_id')) STORED,
	`group_id` text GENERATED ALWAYS AS (json_extract(data, '$.group_id')) STORED,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "memberships_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_user_id_group_id_unique` ON `memberships` (`user_id`,`group_id`);--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT "oauth_clients_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `oauth_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`grant_id` text GENERATED ALWAYS AS (json_extract(data, '$.grant_id')) STORED,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oauth_credentials_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `oauth_credentials_grant_id` ON `oauth_credentials` (`grant_id`);--> statement-breakpoint
CREATE TABLE `oauth_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`client_id` text GENERATED ALWAYS AS (json_extract(data, '$.client_id')) STORED,
	`user_id` text GENERATED ALWAYS AS (json_extract(data, '$.user_id')) STORED,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oauth_grants_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `oauth_grants_client_id` ON `oauth_grants` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_grants_user_id` ON `oauth_grants` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`client_id` text GENERATED ALWAYS AS (json_extract(data, '$.client_id')) STORED,
	`user_id` text GENERATED ALWAYS AS (json_extract(data, '$.user_id')) STORED,
	`grant_id` text GENERATED ALWAYS AS (json_extract(data, '$.grant_id')) STORED,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oauth_requests_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `oauth_requests_client_id` ON `oauth_requests` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_requests_user_id` ON `oauth_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_requests_grant_id` ON `oauth_requests` (`grant_id`);--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`user_id` text GENERATED ALWAYS AS (json_extract(data, '$.user_id')) STORED NOT NULL,
	`version_id` text GENERATED ALWAYS AS (json_extract(data, '$.version_id')) STORED NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recommendations_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendations_user_id_version_id_unique` ON `recommendations` (`user_id`,`version_id`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`asset_id` text GENERATED ALWAYS AS (json_extract(data, '$.asset_id')) STORED,
	`version_id` text GENERATED ALWAYS AS (json_extract(data, '$.version_id')) STORED,
	`request_id` text GENERATED ALWAYS AS (json_extract(data, '$.request_id')) STORED,
	`release_seq` integer GENERATED ALWAYS AS (json_extract(data, '$.release_seq')) STORED,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "releases_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_request_id_unique` ON `releases` (`request_id`);--> statement-breakpoint
CREATE INDEX `releases_version` ON `releases` (`version_id`,`release_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_asset_id_release_seq_unique` ON `releases` (`asset_id`,`release_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_asset_id_id_unique` ON `releases` (`asset_id`,`id`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`asset_id` text GENERATED ALWAYS AS (json_extract(data, '$.asset_id')) STORED,
	`version_id` text GENERATED ALWAYS AS (json_extract(data, '$.version_id')) STORED,
	`source_intake_id` text GENERATED ALWAYS AS (json_extract(data, '$.source_intake_id')) STORED,
	`scan_run_id` text GENERATED ALWAYS AS (json_extract(data, '$.scan_run_id')) STORED,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_intake_id`) REFERENCES `intakes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scan_run_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "requests_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `requests_asset` ON `requests` (`asset_id`);--> statement-breakpoint
CREATE INDEX `requests_intake` ON `requests` (`source_intake_id`);--> statement-breakpoint
CREATE TABLE `role_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`principal_id` text GENERATED ALWAYS AS (json_extract(data, '$.principal_id')) STORED NOT NULL,
	`role_id` text GENERATED ALWAYS AS (json_extract(data, '$.role_id')) STORED,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "role_bindings_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`name` text GENERATED ALWAYS AS (json_extract(data, '$.name')) STORED NOT NULL,
	CONSTRAINT "roles_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version_id` text GENERATED ALWAYS AS (json_extract(data, '$.version_id')) STORED,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "scans_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`name` text GENERATED ALWAYS AS (json_extract(data, '$.name')) STORED NOT NULL,
	CONSTRAINT "scenarios_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `scenarios_name_unique` ON `scenarios` (`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`user_id` text GENERATED ALWAYS AS (json_extract(data, '$.user_id')) STORED,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sessions_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`owner_group_id` text GENERATED ALWAYS AS (json_extract(data, '$.owner_group_id')) STORED,
	FOREIGN KEY (`owner_group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sources_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`user_id` text GENERATED ALWAYS AS (json_extract(data, '$.user_id')) STORED,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tokens_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`username` text GENERATED ALWAYS AS (json_extract(data, '$.username')) STORED NOT NULL,
	CONSTRAINT "users_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`asset_id` text GENERATED ALWAYS AS (json_extract(data, '$.asset_id')) STORED,
	`version_label` text GENERATED ALWAYS AS (json_extract(data, '$.version_label')) STORED NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "versions_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX `versions_asset` ON `versions` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `versions_asset_id_version_label_unique` ON `versions` (`asset_id`,`version_label`);
--> statement-breakpoint
CREATE TRIGGER releases_immutable BEFORE
UPDATE ON releases BEGIN
SELECT
  RAISE (ABORT, 'immutable release');

END;
--> statement-breakpoint
CREATE TRIGGER releases_keep BEFORE DELETE ON releases BEGIN
SELECT
  RAISE (ABORT, 'immutable release');

END;
--> statement-breakpoint
CREATE TRIGGER audit_immutable BEFORE
UPDATE ON audit BEGIN
SELECT
  RAISE (ABORT, 'append-only audit');

END;
--> statement-breakpoint
CREATE TRIGGER audit_keep BEFORE DELETE ON audit BEGIN
SELECT
  RAISE (ABORT, 'append-only audit');

END;
--> statement-breakpoint
CREATE TRIGGER version_immutable BEFORE
UPDATE ON versions WHEN (
  EXISTS (
    SELECT
      fullkey,
      CASE
        WHEN type IN ('integer', 'real') THEN 'number'
        ELSE type
      END,
      atom
    FROM
      json_tree(json_remove(NEW.data, '$.availability'))
    EXCEPT
    SELECT
      fullkey,
      CASE
        WHEN type IN ('integer', 'real') THEN 'number'
        ELSE type
      END,
      atom
    FROM
      json_tree(json_remove(OLD.data, '$.availability'))
  )
  OR EXISTS (
    SELECT
      fullkey,
      CASE
        WHEN type IN ('integer', 'real') THEN 'number'
        ELSE type
      END,
      atom
    FROM
      json_tree(json_remove(OLD.data, '$.availability'))
    EXCEPT
    SELECT
      fullkey,
      CASE
        WHEN type IN ('integer', 'real') THEN 'number'
        ELSE type
      END,
      atom
    FROM
      json_tree(json_remove(NEW.data, '$.availability'))
  )
) BEGIN
SELECT
  RAISE (ABORT, 'immutable version');

END;
--> statement-breakpoint
CREATE TRIGGER version_keep BEFORE DELETE ON versions BEGIN
SELECT
  RAISE (ABORT, 'immutable version');

END;
--> statement-breakpoint
CREATE TRIGGER release_consistency BEFORE INSERT ON releases WHEN (
  SELECT
    asset_id
  FROM
    versions
  WHERE
    id = NEW.version_id
) <> NEW.asset_id
OR (
  SELECT
    asset_id
  FROM
    requests
  WHERE
    id = NEW.request_id
) <> NEW.asset_id
OR (
  SELECT
    version_id
  FROM
    requests
  WHERE
    id = NEW.request_id
) <> NEW.version_id BEGIN
SELECT
  RAISE (ABORT, 'release mismatch');

END;
--> statement-breakpoint
CREATE TRIGGER pointer_consistency BEFORE
UPDATE ON assets WHEN NEW.current_release_id IS NOT NULL
AND (
  SELECT
    asset_id
  FROM
    releases
  WHERE
    id = NEW.current_release_id
) <> NEW.id BEGIN
SELECT
  RAISE (ABORT, 'release pointer mismatch');

END;
--> statement-breakpoint
CREATE TRIGGER pointer_consistency_insert BEFORE INSERT ON assets WHEN NEW.current_release_id IS NOT NULL
AND (
  SELECT
    asset_id
  FROM
    releases
  WHERE
    id = NEW.current_release_id
) <> NEW.id BEGIN
SELECT
  RAISE (ABORT, 'release pointer mismatch');

END;
--> statement-breakpoint
CREATE TRIGGER request_consistency BEFORE INSERT ON requests WHEN (
  SELECT
    asset_id
  FROM
    versions
  WHERE
    id = NEW.version_id
) <> NEW.asset_id
OR (
  SELECT
    version_id
  FROM
    scans
  WHERE
    id = NEW.scan_run_id
) <> NEW.version_id
OR json_extract(
  (
    SELECT
      data
    FROM
      intakes
    WHERE
      id = NEW.source_intake_id
  ),
  '$.version_id'
) <> NEW.version_id
OR json_extract(
  (
    SELECT
      data
    FROM
      intakes
    WHERE
      id = NEW.source_intake_id
  ),
  '$.asset_id'
) <> NEW.asset_id BEGIN
SELECT
  RAISE (ABORT, 'request evidence mismatch');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_users_insert BEFORE INSERT ON users WHEN NOT (
  json_type(NEW.data, '$.username') = 'text'
  AND json_type(NEW.data, '$.active') IN ('true', 'false')
  AND json_extract(NEW.data, '$.revision') >= 1
)
OR (
  json_type(NEW.data, '$.username') = 'text'
  AND json_type(NEW.data, '$.active') IN ('true', 'false')
  AND json_extract(NEW.data, '$.revision') >= 1
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_users_update BEFORE
UPDATE ON users WHEN NOT (
  json_type(NEW.data, '$.username') = 'text'
  AND json_type(NEW.data, '$.active') IN ('true', 'false')
  AND json_extract(NEW.data, '$.revision') >= 1
)
OR (
  json_type(NEW.data, '$.username') = 'text'
  AND json_type(NEW.data, '$.active') IN ('true', 'false')
  AND json_extract(NEW.data, '$.revision') >= 1
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_groups_insert BEFORE INSERT ON groups WHEN NOT (
  json_type(NEW.data, '$.name') = 'text'
  AND json_type(NEW.data, '$.active') IN ('true', 'false')
)
OR (
  json_type(NEW.data, '$.name') = 'text'
  AND json_type(NEW.data, '$.active') IN ('true', 'false')
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_groups_update BEFORE
UPDATE ON groups WHEN NOT (
  json_type(NEW.data, '$.name') = 'text'
  AND json_type(NEW.data, '$.active') IN ('true', 'false')
)
OR (
  json_type(NEW.data, '$.name') = 'text'
  AND json_type(NEW.data, '$.active') IN ('true', 'false')
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_assets_insert BEFORE INSERT ON assets WHEN NOT (
  NEW.source_id IS NOT NULL
  AND NEW.owner_group_id IS NOT NULL
  AND json_extract(NEW.data, '$.kind') IN ('skill', 'mcp')
  AND json_extract(NEW.data, '$.lifecycle') IN ('active', 'deprecated', 'blocked')
  AND json_extract(NEW.data, '$.revision') >= 1
)
OR (
  NEW.source_id IS NOT NULL
  AND NEW.owner_group_id IS NOT NULL
  AND json_extract(NEW.data, '$.kind') IN ('skill', 'mcp')
  AND json_extract(NEW.data, '$.lifecycle') IN ('active', 'deprecated', 'blocked')
  AND json_extract(NEW.data, '$.revision') >= 1
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_assets_update BEFORE
UPDATE ON assets WHEN NOT (
  NEW.source_id IS NOT NULL
  AND NEW.owner_group_id IS NOT NULL
  AND json_extract(NEW.data, '$.kind') IN ('skill', 'mcp')
  AND json_extract(NEW.data, '$.lifecycle') IN ('active', 'deprecated', 'blocked')
  AND json_extract(NEW.data, '$.revision') >= 1
)
OR (
  NEW.source_id IS NOT NULL
  AND NEW.owner_group_id IS NOT NULL
  AND json_extract(NEW.data, '$.kind') IN ('skill', 'mcp')
  AND json_extract(NEW.data, '$.lifecycle') IN ('active', 'deprecated', 'blocked')
  AND json_extract(NEW.data, '$.revision') >= 1
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_sources_insert BEFORE INSERT ON sources WHEN NOT (
  NEW.owner_group_id IS NOT NULL
  AND json_extract(NEW.data, '$.kind') IN ('git', 'upload')
  AND json_extract(NEW.data, '$.state') IN ('active', 'paused', 'auth_error', 'blocked')
  AND json_extract(NEW.data, '$.revision') >= 1
)
OR (
  NEW.owner_group_id IS NOT NULL
  AND json_extract(NEW.data, '$.kind') IN ('git', 'upload')
  AND json_extract(NEW.data, '$.state') IN ('active', 'paused', 'auth_error', 'blocked')
  AND json_extract(NEW.data, '$.revision') >= 1
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_sources_update BEFORE
UPDATE ON sources WHEN NOT (
  NEW.owner_group_id IS NOT NULL
  AND json_extract(NEW.data, '$.kind') IN ('git', 'upload')
  AND json_extract(NEW.data, '$.state') IN ('active', 'paused', 'auth_error', 'blocked')
  AND json_extract(NEW.data, '$.revision') >= 1
)
OR (
  NEW.owner_group_id IS NOT NULL
  AND json_extract(NEW.data, '$.kind') IN ('git', 'upload')
  AND json_extract(NEW.data, '$.state') IN ('active', 'paused', 'auth_error', 'blocked')
  AND json_extract(NEW.data, '$.revision') >= 1
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_bindings_insert BEFORE INSERT ON bindings WHEN NOT (
  NEW.source_id IS NOT NULL
  AND NEW.asset_id IS NOT NULL
  AND (
    NEW.retired_at IS NOT NULL
    OR (
      SELECT
        source_id
      FROM
        assets
      WHERE
        id = NEW.asset_id
    ) = NEW.source_id
  )
  AND json_type(NEW.data, '$.enabled') IN ('true', 'false')
)
OR (
  NEW.source_id IS NOT NULL
  AND NEW.asset_id IS NOT NULL
  AND (
    NEW.retired_at IS NOT NULL
    OR (
      SELECT
        source_id
      FROM
        assets
      WHERE
        id = NEW.asset_id
    ) = NEW.source_id
  )
  AND json_type(NEW.data, '$.enabled') IN ('true', 'false')
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_bindings_update BEFORE
UPDATE ON bindings WHEN NOT (
  NEW.source_id IS NOT NULL
  AND NEW.asset_id IS NOT NULL
  AND (
    NEW.retired_at IS NOT NULL
    OR (
      SELECT
        source_id
      FROM
        assets
      WHERE
        id = NEW.asset_id
    ) = NEW.source_id
  )
  AND json_type(NEW.data, '$.enabled') IN ('true', 'false')
)
OR (
  NEW.source_id IS NOT NULL
  AND NEW.asset_id IS NOT NULL
  AND (
    NEW.retired_at IS NOT NULL
    OR (
      SELECT
        source_id
      FROM
        assets
      WHERE
        id = NEW.asset_id
    ) = NEW.source_id
  )
  AND json_type(NEW.data, '$.enabled') IN ('true', 'false')
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_versions_insert BEFORE INSERT ON versions WHEN NOT (
  NEW.asset_id IS NOT NULL
  AND json_extract(NEW.data, '$.availability') IN ('unreleased', 'released', 'revoked')
  AND length(json_extract(NEW.data, '$.content_digest')) = 71
  AND json_extract(NEW.data, '$.manifest.kind') = (
    SELECT
      json_extract(data, '$.kind')
    FROM
      assets
    WHERE
      id = NEW.asset_id
  )
)
OR (
  NEW.asset_id IS NOT NULL
  AND json_extract(NEW.data, '$.availability') IN ('unreleased', 'released', 'revoked')
  AND length(json_extract(NEW.data, '$.content_digest')) = 71
  AND json_extract(NEW.data, '$.manifest.kind') = (
    SELECT
      json_extract(data, '$.kind')
    FROM
      assets
    WHERE
      id = NEW.asset_id
  )
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_versions_update BEFORE
UPDATE ON versions WHEN NOT (
  NEW.asset_id IS NOT NULL
  AND json_extract(NEW.data, '$.availability') IN ('unreleased', 'released', 'revoked')
  AND length(json_extract(NEW.data, '$.content_digest')) = 71
  AND json_extract(NEW.data, '$.manifest.kind') = (
    SELECT
      json_extract(data, '$.kind')
    FROM
      assets
    WHERE
      id = NEW.asset_id
  )
)
OR (
  NEW.asset_id IS NOT NULL
  AND json_extract(NEW.data, '$.availability') IN ('unreleased', 'released', 'revoked')
  AND length(json_extract(NEW.data, '$.content_digest')) = 71
  AND json_extract(NEW.data, '$.manifest.kind') = (
    SELECT
      json_extract(data, '$.kind')
    FROM
      assets
    WHERE
      id = NEW.asset_id
  )
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_intakes_insert BEFORE INSERT ON intakes WHEN NOT (
  NEW.source_id IS NOT NULL
  AND NEW.asset_id IS NOT NULL
  AND json_extract(NEW.data, '$.state') IN (
    'received',
    'fetching',
    'scanning',
    'ready',
    'failed',
    'cancelled'
  )
  AND (
    json_extract(NEW.data, '$.state') <> 'ready'
    OR EXISTS (
      SELECT
        1
      FROM
        versions v
      WHERE
        v.id = json_extract(NEW.data, '$.version_id')
        AND v.asset_id = NEW.asset_id
        AND json_extract(v.data, '$.content_digest') = json_extract(NEW.data, '$.content_digest')
    )
  )
)
OR (
  NEW.source_id IS NOT NULL
  AND NEW.asset_id IS NOT NULL
  AND json_extract(NEW.data, '$.state') IN (
    'received',
    'fetching',
    'scanning',
    'ready',
    'failed',
    'cancelled'
  )
  AND (
    json_extract(NEW.data, '$.state') <> 'ready'
    OR EXISTS (
      SELECT
        1
      FROM
        versions v
      WHERE
        v.id = json_extract(NEW.data, '$.version_id')
        AND v.asset_id = NEW.asset_id
        AND json_extract(v.data, '$.content_digest') = json_extract(NEW.data, '$.content_digest')
    )
  )
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_intakes_update BEFORE
UPDATE ON intakes WHEN NOT (
  NEW.source_id IS NOT NULL
  AND NEW.asset_id IS NOT NULL
  AND json_extract(NEW.data, '$.state') IN (
    'received',
    'fetching',
    'scanning',
    'ready',
    'failed',
    'cancelled'
  )
  AND (
    json_extract(NEW.data, '$.state') <> 'ready'
    OR EXISTS (
      SELECT
        1
      FROM
        versions v
      WHERE
        v.id = json_extract(NEW.data, '$.version_id')
        AND v.asset_id = NEW.asset_id
        AND json_extract(v.data, '$.content_digest') = json_extract(NEW.data, '$.content_digest')
    )
  )
)
OR (
  NEW.source_id IS NOT NULL
  AND NEW.asset_id IS NOT NULL
  AND json_extract(NEW.data, '$.state') IN (
    'received',
    'fetching',
    'scanning',
    'ready',
    'failed',
    'cancelled'
  )
  AND (
    json_extract(NEW.data, '$.state') <> 'ready'
    OR EXISTS (
      SELECT
        1
      FROM
        versions v
      WHERE
        v.id = json_extract(NEW.data, '$.version_id')
        AND v.asset_id = NEW.asset_id
        AND json_extract(v.data, '$.content_digest') = json_extract(NEW.data, '$.content_digest')
    )
  )
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_scans_insert BEFORE INSERT ON scans WHEN NOT (
  NEW.version_id IS NOT NULL
  AND json_extract(NEW.data, '$.state') IN ('passed', 'blocked')
)
OR (
  NEW.version_id IS NOT NULL
  AND json_extract(NEW.data, '$.state') IN ('passed', 'blocked')
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_scans_update BEFORE
UPDATE ON scans WHEN NOT (
  NEW.version_id IS NOT NULL
  AND json_extract(NEW.data, '$.state') IN ('passed', 'blocked')
)
OR (
  NEW.version_id IS NOT NULL
  AND json_extract(NEW.data, '$.state') IN ('passed', 'blocked')
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_requests_insert BEFORE INSERT ON requests WHEN NOT (
  NEW.asset_id IS NOT NULL
  AND NEW.version_id IS NOT NULL
  AND NEW.scan_run_id IS NOT NULL
  AND NEW.source_intake_id IS NOT NULL
  AND json_type(NEW.data, '$.applies_to') = 'object'
  AND json_extract(NEW.data, '$.state') IN (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'stale'
  )
  AND json_extract(NEW.data, '$.content_digest') = (
    SELECT
      json_extract(data, '$.content_digest')
    FROM
      intakes
    WHERE
      id = NEW.source_intake_id
  )
)
OR (
  NEW.asset_id IS NOT NULL
  AND NEW.version_id IS NOT NULL
  AND NEW.scan_run_id IS NOT NULL
  AND NEW.source_intake_id IS NOT NULL
  AND json_type(NEW.data, '$.applies_to') = 'object'
  AND json_extract(NEW.data, '$.state') IN (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'stale'
  )
  AND json_extract(NEW.data, '$.content_digest') = (
    SELECT
      json_extract(data, '$.content_digest')
    FROM
      intakes
    WHERE
      id = NEW.source_intake_id
  )
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_requests_update BEFORE
UPDATE ON requests WHEN NOT (
  NEW.asset_id IS NOT NULL
  AND NEW.version_id IS NOT NULL
  AND NEW.scan_run_id IS NOT NULL
  AND NEW.source_intake_id IS NOT NULL
  AND json_type(NEW.data, '$.applies_to') = 'object'
  AND json_extract(NEW.data, '$.state') IN (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'stale'
  )
  AND json_extract(NEW.data, '$.content_digest') = (
    SELECT
      json_extract(data, '$.content_digest')
    FROM
      intakes
    WHERE
      id = NEW.source_intake_id
  )
)
OR (
  NEW.asset_id IS NOT NULL
  AND NEW.version_id IS NOT NULL
  AND NEW.scan_run_id IS NOT NULL
  AND NEW.source_intake_id IS NOT NULL
  AND json_type(NEW.data, '$.applies_to') = 'object'
  AND json_extract(NEW.data, '$.state') IN (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'stale'
  )
  AND json_extract(NEW.data, '$.content_digest') = (
    SELECT
      json_extract(data, '$.content_digest')
    FROM
      intakes
    WHERE
      id = NEW.source_intake_id
  )
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_releases_insert BEFORE INSERT ON releases WHEN NOT (
  NEW.asset_id IS NOT NULL
  AND NEW.version_id IS NOT NULL
  AND NEW.request_id IS NOT NULL
  AND NEW.release_seq >= 1
  AND json_type(NEW.data, '$.applies_to') = 'object'
  AND EXISTS (
    SELECT
      1
    FROM
      sources
    WHERE
      id = json_extract(NEW.data, '$.policy_source_id')
  )
)
OR (
  NEW.asset_id IS NOT NULL
  AND NEW.version_id IS NOT NULL
  AND NEW.request_id IS NOT NULL
  AND NEW.release_seq >= 1
  AND json_type(NEW.data, '$.applies_to') = 'object'
  AND EXISTS (
    SELECT
      1
    FROM
      sources
    WHERE
      id = json_extract(NEW.data, '$.policy_source_id')
  )
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_releases_update BEFORE
UPDATE ON releases WHEN NOT (
  NEW.asset_id IS NOT NULL
  AND NEW.version_id IS NOT NULL
  AND NEW.request_id IS NOT NULL
  AND NEW.release_seq >= 1
  AND json_type(NEW.data, '$.applies_to') = 'object'
  AND EXISTS (
    SELECT
      1
    FROM
      sources
    WHERE
      id = json_extract(NEW.data, '$.policy_source_id')
  )
)
OR (
  NEW.asset_id IS NOT NULL
  AND NEW.version_id IS NOT NULL
  AND NEW.request_id IS NOT NULL
  AND NEW.release_seq >= 1
  AND json_type(NEW.data, '$.applies_to') = 'object'
  AND EXISTS (
    SELECT
      1
    FROM
      sources
    WHERE
      id = json_extract(NEW.data, '$.policy_source_id')
  )
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_jobs_insert BEFORE INSERT ON jobs WHEN NOT (
  json_extract(NEW.data, '$.state') IN (
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled'
  )
  AND json_extract(NEW.data, '$.lease_epoch') >= 0
)
OR (
  json_extract(NEW.data, '$.state') IN (
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled'
  )
  AND json_extract(NEW.data, '$.lease_epoch') >= 0
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER invariant_jobs_update BEFORE
UPDATE ON jobs WHEN NOT (
  json_extract(NEW.data, '$.state') IN (
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled'
  )
  AND json_extract(NEW.data, '$.lease_epoch') >= 0
)
OR (
  json_extract(NEW.data, '$.state') IN (
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled'
  )
  AND json_extract(NEW.data, '$.lease_epoch') >= 0
) IS NULL BEGIN
SELECT
  RAISE (ABORT, 'domain invariant violated');

END;
--> statement-breakpoint
CREATE TRIGGER asset_identity_immutable BEFORE
UPDATE ON assets WHEN NEW.slug <> OLD.slug
OR json_extract(NEW.data, '$.kind') <> json_extract(OLD.data, '$.kind') BEGIN
SELECT
  RAISE (ABORT, 'asset identity immutable');

END;
--> statement-breakpoint
CREATE TRIGGER source_identity_immutable BEFORE
UPDATE ON sources WHEN json_extract(NEW.data, '$.canonical_url') IS NOT json_extract(OLD.data, '$.canonical_url')
OR json_extract(NEW.data, '$.repository_identity') IS NOT json_extract(OLD.data, '$.repository_identity')
OR json_extract(NEW.data, '$.provider') IS NOT json_extract(OLD.data, '$.provider')
OR NEW.owner_group_id <> OLD.owner_group_id BEGIN
SELECT
  RAISE (ABORT, 'source identity immutable');

END;
--> statement-breakpoint
CREATE TRIGGER scan_immutable BEFORE
UPDATE ON scans BEGIN
SELECT
  RAISE (ABORT, 'scan immutable');

END;
--> statement-breakpoint
CREATE TRIGGER scan_keep BEFORE DELETE ON scans BEGIN
SELECT
  RAISE (ABORT, 'scan immutable');

END;
--> statement-breakpoint
CREATE TRIGGER request_keep BEFORE DELETE ON requests BEGIN
SELECT
  RAISE (ABORT, 'frozen request immutable');

END;
--> statement-breakpoint
CREATE TRIGGER request_decision_immutable BEFORE
UPDATE ON requests WHEN json_extract(OLD.data, '$.state') <> 'pending' BEGIN
SELECT
  RAISE (ABORT, 'resolved request immutable');

END;
--> statement-breakpoint
CREATE TRIGGER request_policy_immutable BEFORE
UPDATE ON requests WHEN (
  EXISTS (
    SELECT
      fullkey,
      CASE
        WHEN type IN ('integer', 'real') THEN 'number'
        ELSE type
      END,
      atom
    FROM
      json_tree(
        json_remove(
          NEW.data,
          '$.state',
          '$.decision_by',
          '$.decision_reason',
          '$.accepted_warnings',
          '$.decided_at',
          '$.revision',
          '$.stale_reason'
        )
      )
    EXCEPT
    SELECT
      fullkey,
      CASE
        WHEN type IN ('integer', 'real') THEN 'number'
        ELSE type
      END,
      atom
    FROM
      json_tree(
        json_remove(
          OLD.data,
          '$.state',
          '$.decision_by',
          '$.decision_reason',
          '$.accepted_warnings',
          '$.decided_at',
          '$.revision',
          '$.stale_reason'
        )
      )
  )
  OR EXISTS (
    SELECT
      fullkey,
      CASE
        WHEN type IN ('integer', 'real') THEN 'number'
        ELSE type
      END,
      atom
    FROM
      json_tree(
        json_remove(
          OLD.data,
          '$.state',
          '$.decision_by',
          '$.decision_reason',
          '$.accepted_warnings',
          '$.decided_at',
          '$.revision',
          '$.stale_reason'
        )
      )
    EXCEPT
    SELECT
      fullkey,
      CASE
        WHEN type IN ('integer', 'real') THEN 'number'
        ELSE type
      END,
      atom
    FROM
      json_tree(
        json_remove(
          NEW.data,
          '$.state',
          '$.decision_by',
          '$.decision_reason',
          '$.accepted_warnings',
          '$.decided_at',
          '$.revision',
          '$.stale_reason'
        )
      )
  )
) BEGIN
SELECT
  RAISE (ABORT, 'frozen request immutable');

END;
--> statement-breakpoint
INSERT INTO
  hub_revision (id)
VALUES
  (1);
--> statement-breakpoint
CREATE TRIGGER revision_assets_insert AFTER INSERT ON assets BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_assets_update AFTER
UPDATE ON assets BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_assets_delete AFTER DELETE ON assets BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_bindings_insert AFTER INSERT ON bindings BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_bindings_update AFTER
UPDATE ON bindings BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_bindings_delete AFTER DELETE ON bindings BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_groups_insert AFTER INSERT ON groups BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_groups_update AFTER
UPDATE ON groups BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_groups_delete AFTER DELETE ON groups BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_memberships_insert AFTER INSERT ON memberships BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_memberships_update AFTER
UPDATE ON memberships BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_memberships_delete AFTER DELETE ON memberships BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_releases_insert AFTER INSERT ON releases BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_releases_update AFTER
UPDATE ON releases BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_releases_delete AFTER DELETE ON releases BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_role_bindings_insert AFTER INSERT ON role_bindings BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_role_bindings_update AFTER
UPDATE ON role_bindings BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_role_bindings_delete AFTER DELETE ON role_bindings BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_roles_insert AFTER INSERT ON roles BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_roles_update AFTER
UPDATE ON roles BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_roles_delete AFTER DELETE ON roles BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_scenarios_insert AFTER INSERT ON scenarios BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_scenarios_update AFTER
UPDATE ON scenarios BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_scenarios_delete AFTER DELETE ON scenarios BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_sources_insert AFTER INSERT ON sources BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_sources_update AFTER
UPDATE ON sources BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_sources_delete AFTER DELETE ON sources BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_users_insert AFTER INSERT ON users BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_users_update AFTER
UPDATE ON users BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_users_delete AFTER DELETE ON users BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_versions_insert AFTER INSERT ON versions BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_versions_update AFTER
UPDATE ON versions BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
--> statement-breakpoint
CREATE TRIGGER revision_versions_delete AFTER DELETE ON versions BEGIN
UPDATE hub_revision
SET
  revision = revision + 1
WHERE
  id = 1;

END;
