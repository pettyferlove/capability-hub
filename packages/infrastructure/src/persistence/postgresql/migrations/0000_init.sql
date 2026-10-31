CREATE TABLE "asset_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"asset_id" text GENERATED ALWAYS AS (data ->> 'asset_id') STORED NOT NULL,
	"version_id" text GENERATED ALWAYS AS (data ->> 'version_id') STORED NOT NULL,
	"submitted_by" text GENERATED ALWAYS AS (data ->> 'submitted_by') STORED NOT NULL,
	"request_key" text GENERATED ALWAYS AS (data ->> 'request_key') STORED NOT NULL,
	CONSTRAINT "asset_feedback_submitted_by_request_key_unique" UNIQUE("submitted_by","request_key"),
	CONSTRAINT "asset_feedback_data_check" CHECK (( jsonb_typeof(data) = 'object' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"slug" text GENERATED ALWAYS AS ((data ->> 'slug')) STORED NOT NULL,
	"source_id" text GENERATED ALWAYS AS ((data ->> 'source_id')) STORED,
	"owner_group_id" text GENERATED ALWAYS AS ((data ->> 'owner_group_id')) STORED,
	"current_release_id" text GENERATED ALWAYS AS ((data ->> 'current_release_id')) STORED,
	CONSTRAINT "assets_slug_unique" UNIQUE("slug"),
	CONSTRAINT "assets_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "audit" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"occurred_at" text GENERATED ALWAYS AS ((data ->> 'occurred_at')) STORED NOT NULL,
	CONSTRAINT "audit_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"source_id" text GENERATED ALWAYS AS ((data ->> 'source_id')) STORED,
	"asset_id" text GENERATED ALWAYS AS ((data ->> 'asset_id')) STORED,
	"path" text GENERATED ALWAYS AS ((data ->> 'path')) STORED,
	"retired_at" text GENERATED ALWAYS AS ((data ->> 'retired_at')) STORED,
	CONSTRAINT "bindings_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "cli_logins" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"code" text GENERATED ALWAYS AS ((data ->> 'code')) STORED,
	CONSTRAINT "cli_logins_code_unique" UNIQUE("code"),
	CONSTRAINT "cli_logins_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "git_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"user_id" text GENERATED ALWAYS AS ((data ->> 'user_id')) STORED,
	CONSTRAINT "git_credentials_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"name" text GENERATED ALWAYS AS ((data ->> 'name')) STORED NOT NULL,
	CONSTRAINT "groups_name_unique" UNIQUE("name"),
	CONSTRAINT "groups_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "hub_revision" (
	"id" integer PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "hub_revision_id_check" CHECK (id = 1)
);
--> statement-breakpoint
CREATE TABLE "idempotency" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"principal_id" text GENERATED ALWAYS AS ((data ->> 'principal_id')) STORED,
	"route" text GENERATED ALWAYS AS ((data ->> 'route')) STORED,
	"key" text GENERATED ALWAYS AS ((data ->> 'key')) STORED,
	CONSTRAINT "idempotency_principal_id_route_key_unique" UNIQUE("principal_id","route","key"),
	CONSTRAINT "idempotency_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "intakes" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"asset_id" text GENERATED ALWAYS AS ((data ->> 'asset_id')) STORED,
	"source_id" text GENERATED ALWAYS AS ((data ->> 'source_id')) STORED,
	"binding_id" text GENERATED ALWAYS AS ((data ->> 'binding_id')) STORED,
	CONSTRAINT "intakes_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"aggregate_id" text GENERATED ALWAYS AS ((data ->> 'aggregate_id')) STORED NOT NULL,
	CONSTRAINT "jobs_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"window_expires_at" bigint GENERATED ALWAYS AS (((data ->> 'window_expires_at')::bigint)) STORED NOT NULL,
	CONSTRAINT "login_attempts_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"user_id" text GENERATED ALWAYS AS ((data ->> 'user_id')) STORED,
	"group_id" text GENERATED ALWAYS AS ((data ->> 'group_id')) STORED,
	CONSTRAINT "memberships_user_id_group_id_unique" UNIQUE("user_id","group_id"),
	CONSTRAINT "memberships_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "oauth_clients_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "oauth_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"grant_id" text GENERATED ALWAYS AS ((data ->> 'grant_id')) STORED,
	CONSTRAINT "oauth_credentials_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "oauth_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"client_id" text GENERATED ALWAYS AS ((data ->> 'client_id')) STORED,
	"user_id" text GENERATED ALWAYS AS ((data ->> 'user_id')) STORED,
	CONSTRAINT "oauth_grants_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "oauth_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"client_id" text GENERATED ALWAYS AS ((data ->> 'client_id')) STORED,
	"user_id" text GENERATED ALWAYS AS ((data ->> 'user_id')) STORED,
	"grant_id" text GENERATED ALWAYS AS ((data ->> 'grant_id')) STORED,
	CONSTRAINT "oauth_requests_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"user_id" text GENERATED ALWAYS AS ((data ->> 'user_id')) STORED NOT NULL,
	"version_id" text GENERATED ALWAYS AS ((data ->> 'version_id')) STORED NOT NULL,
	CONSTRAINT "recommendations_user_id_version_id_unique" UNIQUE("user_id","version_id"),
	CONSTRAINT "recommendations_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"asset_id" text GENERATED ALWAYS AS ((data ->> 'asset_id')) STORED,
	"version_id" text GENERATED ALWAYS AS ((data ->> 'version_id')) STORED,
	"request_id" text GENERATED ALWAYS AS ((data ->> 'request_id')) STORED,
	"release_seq" bigint GENERATED ALWAYS AS (((data ->> 'release_seq')::bigint)) STORED,
	CONSTRAINT "releases_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "releases_asset_id_release_seq_unique" UNIQUE("asset_id","release_seq"),
	CONSTRAINT "releases_asset_id_id_unique" UNIQUE("asset_id","id"),
	CONSTRAINT "releases_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"asset_id" text GENERATED ALWAYS AS ((data ->> 'asset_id')) STORED,
	"version_id" text GENERATED ALWAYS AS ((data ->> 'version_id')) STORED,
	"source_intake_id" text GENERATED ALWAYS AS ((data ->> 'source_intake_id')) STORED,
	"scan_run_id" text GENERATED ALWAYS AS ((data ->> 'scan_run_id')) STORED,
	CONSTRAINT "requests_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "role_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"principal_id" text GENERATED ALWAYS AS ((data ->> 'principal_id')) STORED NOT NULL,
	"role_id" text GENERATED ALWAYS AS ((data ->> 'role_id')) STORED,
	CONSTRAINT "role_bindings_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"name" text GENERATED ALWAYS AS ((data ->> 'name')) STORED NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name"),
	CONSTRAINT "roles_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version_id" text GENERATED ALWAYS AS ((data ->> 'version_id')) STORED,
	CONSTRAINT "scans_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"name" text GENERATED ALWAYS AS ((data ->> 'name')) STORED NOT NULL,
	CONSTRAINT "scenarios_name_unique" UNIQUE("name"),
	CONSTRAINT "scenarios_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"user_id" text GENERATED ALWAYS AS ((data ->> 'user_id')) STORED,
	CONSTRAINT "sessions_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_group_id" text GENERATED ALWAYS AS ((data ->> 'owner_group_id')) STORED,
	CONSTRAINT "sources_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"user_id" text GENERATED ALWAYS AS ((data ->> 'user_id')) STORED,
	CONSTRAINT "tokens_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"username" text GENERATED ALWAYS AS ((data ->> 'username')) STORED NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"asset_id" text GENERATED ALWAYS AS ((data ->> 'asset_id')) STORED,
	"version_label" text GENERATED ALWAYS AS ((data ->> 'version_label')) STORED NOT NULL,
	CONSTRAINT "versions_asset_id_version_label_unique" UNIQUE("asset_id","version_label"),
	CONSTRAINT "versions_data_check" CHECK (( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "asset_feedback" ADD CONSTRAINT "asset_feedback_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_feedback" ADD CONSTRAINT "asset_feedback_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_feedback" ADD CONSTRAINT "asset_feedback_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_group_id_groups_id_fk" FOREIGN KEY ("owner_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_id_current_release_id_releases_asset_id_id_fk" FOREIGN KEY ("id","current_release_id") REFERENCES "public"."releases"("asset_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "bindings" ADD CONSTRAINT "bindings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindings" ADD CONSTRAINT "bindings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_credentials" ADD CONSTRAINT "git_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency" ADD CONSTRAINT "idempotency_principal_id_users_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_binding_id_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."bindings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_credentials" ADD CONSTRAINT "oauth_credentials_grant_id_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_requests" ADD CONSTRAINT "oauth_requests_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_requests" ADD CONSTRAINT "oauth_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_requests" ADD CONSTRAINT "oauth_requests_grant_id_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_source_intake_id_intakes_id_fk" FOREIGN KEY ("source_intake_id") REFERENCES "public"."intakes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_scan_run_id_scans_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_bindings" ADD CONSTRAINT "role_bindings_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_owner_group_id_groups_id_fk" FOREIGN KEY ("owner_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_feedback_asset" ON "asset_feedback" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "binding_asset" ON "bindings" USING btree ("asset_id") WHERE retired_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "binding_path" ON "bindings" USING btree ("source_id","path") WHERE retired_at IS NULL;--> statement-breakpoint
CREATE INDEX "intake_asset" ON "intakes" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "jobs_schedule" ON "jobs" USING btree ((data ->> 'state'),((data ->> 'run_after')::bigint));--> statement-breakpoint
CREATE INDEX "oauth_credentials_grant_id" ON "oauth_credentials" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "oauth_grants_client_id" ON "oauth_grants" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_grants_user_id" ON "oauth_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_requests_client_id" ON "oauth_requests" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_requests_user_id" ON "oauth_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_requests_grant_id" ON "oauth_requests" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "releases_version" ON "releases" USING btree ("version_id","release_seq");--> statement-breakpoint
CREATE INDEX "requests_asset" ON "requests" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "requests_intake" ON "requests" USING btree ("source_intake_id");--> statement-breakpoint
CREATE INDEX "versions_asset" ON "versions" USING btree ("asset_id");
--> statement-breakpoint
INSERT INTO
  hub_revision (id)
VALUES
  (1);
--> statement-breakpoint
CREATE FUNCTION guard_releases_immutable () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable release' 
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER releases_immutable
BEFORE UPDATE ON releases FOR EACH ROW
EXECUTE FUNCTION guard_releases_immutable ();
--> statement-breakpoint
CREATE FUNCTION guard_releases_keep () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable release' 
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER releases_keep
BEFORE DELETE ON releases FOR EACH ROW
EXECUTE FUNCTION guard_releases_keep ();
--> statement-breakpoint
CREATE FUNCTION guard_audit_immutable () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only audit' 
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_immutable
BEFORE UPDATE ON audit FOR EACH ROW
EXECUTE FUNCTION guard_audit_immutable ();
--> statement-breakpoint
CREATE FUNCTION guard_audit_keep () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only audit' 
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_keep
BEFORE DELETE ON audit FOR EACH ROW
EXECUTE FUNCTION guard_audit_keep ();
--> statement-breakpoint
CREATE FUNCTION guard_version_immutable () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (NEW.data - ARRAY['availability']::TEXT[]) <> (OLD.data - ARRAY['availability']::TEXT[])
  THEN
    RAISE EXCEPTION 'immutable version' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER version_immutable
BEFORE UPDATE ON versions FOR EACH ROW
EXECUTE FUNCTION guard_version_immutable ();
--> statement-breakpoint
CREATE FUNCTION guard_version_keep () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable version' 
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER version_keep
BEFORE DELETE ON versions FOR EACH ROW
EXECUTE FUNCTION guard_version_keep ();
--> statement-breakpoint
CREATE FUNCTION guard_release_consistency () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        SELECT
          asset_id
        FROM
          versions
        WHERE
          id = (NEW.data ->> 'version_id')
      ) <> (NEW.data ->> 'asset_id')
      OR (
        SELECT
          asset_id
        FROM
          requests
        WHERE
          id = (NEW.data ->> 'request_id')
      ) <> (NEW.data ->> 'asset_id')
      OR (
        SELECT
          version_id
        FROM
          requests
        WHERE
          id = (NEW.data ->> 'request_id')
      ) <> (NEW.data ->> 'version_id')
  THEN
    RAISE EXCEPTION 'release mismatch' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER release_consistency
BEFORE INSERT ON releases FOR EACH ROW
EXECUTE FUNCTION guard_release_consistency ();
--> statement-breakpoint
CREATE FUNCTION guard_pointer_consistency () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (NEW.data ->> 'current_release_id') IS DISTINCT FROM NULL
      AND (
        SELECT
          asset_id
        FROM
          releases
        WHERE
          id = (NEW.data ->> 'current_release_id')
      ) <> NEW.id
  THEN
    RAISE EXCEPTION 'release pointer mismatch' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pointer_consistency
BEFORE INSERT OR UPDATE ON assets FOR EACH ROW
EXECUTE FUNCTION guard_pointer_consistency ();
--> statement-breakpoint
CREATE FUNCTION guard_request_consistency () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        SELECT
          asset_id
        FROM
          versions
        WHERE
          id = (NEW.data ->> 'version_id')
      ) <> (NEW.data ->> 'asset_id')
      OR (
        SELECT
          version_id
        FROM
          scans
        WHERE
          id = (NEW.data ->> 'scan_run_id')
      ) <> (NEW.data ->> 'version_id')
      OR (
        SELECT
          data ->> 'version_id'
        FROM
          intakes
        WHERE
          id = (NEW.data ->> 'source_intake_id')
      ) <> (NEW.data ->> 'version_id')
      OR (
        SELECT
          data ->> 'asset_id'
        FROM
          intakes
        WHERE
          id = (NEW.data ->> 'source_intake_id')
      ) <> (NEW.data ->> 'asset_id')
  THEN
    RAISE EXCEPTION 'request evidence mismatch' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER request_consistency
BEFORE INSERT ON requests FOR EACH ROW
EXECUTE FUNCTION guard_request_consistency ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_users () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        jsonb_typeof(NEW.data -> 'username') = 'string'
        AND jsonb_typeof(NEW.data -> 'active') = 'boolean'
        AND ((NEW.data ->> 'revision')::bigint) >= 1
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_users
BEFORE INSERT OR UPDATE ON users FOR EACH ROW
EXECUTE FUNCTION guard_invariant_users ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_groups () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        jsonb_typeof(NEW.data -> 'name') = 'string'
        AND jsonb_typeof(NEW.data -> 'active') = 'boolean'
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_groups
BEFORE INSERT OR UPDATE ON groups FOR EACH ROW
EXECUTE FUNCTION guard_invariant_groups ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_assets () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        (NEW.data ->> 'source_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'owner_group_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'kind') IN ('skill', 'mcp')
        AND (NEW.data ->> 'lifecycle') IN ('active', 'deprecated', 'blocked')
        AND ((NEW.data ->> 'revision')::bigint) >= 1
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_assets
BEFORE INSERT OR UPDATE ON assets FOR EACH ROW
EXECUTE FUNCTION guard_invariant_assets ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_sources () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        (NEW.data ->> 'owner_group_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'kind') IN ('git', 'upload')
        AND (NEW.data ->> 'state') IN ('active', 'paused', 'auth_error', 'blocked')
        AND ((NEW.data ->> 'revision')::bigint) >= 1
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_sources
BEFORE INSERT OR UPDATE ON sources FOR EACH ROW
EXECUTE FUNCTION guard_invariant_sources ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_bindings () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        (NEW.data ->> 'source_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'asset_id') IS DISTINCT FROM NULL
        AND (
          (NEW.data ->> 'retired_at') IS DISTINCT FROM NULL
          OR (
            SELECT
              source_id
            FROM
              assets
            WHERE
              id = (NEW.data ->> 'asset_id')
          ) = (NEW.data ->> 'source_id')
        )
        AND jsonb_typeof(NEW.data -> 'enabled') = 'boolean'
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_bindings
BEFORE INSERT OR UPDATE ON bindings FOR EACH ROW
EXECUTE FUNCTION guard_invariant_bindings ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_versions () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        (NEW.data ->> 'asset_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'availability') IN ('unreleased', 'released', 'revoked')
        AND length((NEW.data ->> 'content_digest')) = 71
        AND (NEW.data #>> '{manifest,kind}') = (
          SELECT
            (data ->> 'kind')
          FROM
            assets
          WHERE
            id = (NEW.data ->> 'asset_id')
        )
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_versions
BEFORE INSERT OR UPDATE ON versions FOR EACH ROW
EXECUTE FUNCTION guard_invariant_versions ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_intakes () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        (NEW.data ->> 'source_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'asset_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'state') IN (
          'received',
          'fetching',
                  'scanning',
          'ready',
          'failed',
          'cancelled'
        )
        AND (
          (NEW.data ->> 'state') <> 'ready'
          OR EXISTS (
            SELECT
              1
            FROM
              versions v
            WHERE
              v.id = (NEW.data ->> 'version_id')
              AND v.asset_id = (NEW.data ->> 'asset_id')
              AND (v.data ->> 'content_digest') = (NEW.data ->> 'content_digest')
          )
        )
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_intakes
BEFORE INSERT OR UPDATE ON intakes FOR EACH ROW
EXECUTE FUNCTION guard_invariant_intakes ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_scans () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        (NEW.data ->> 'version_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'state') IN ('passed', 'blocked')
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_scans
BEFORE INSERT OR UPDATE ON scans FOR EACH ROW
EXECUTE FUNCTION guard_invariant_scans ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_requests () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        (NEW.data ->> 'asset_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'version_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'scan_run_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'source_intake_id') IS DISTINCT FROM NULL
        AND jsonb_typeof(NEW.data -> 'applies_to') = 'object'
        AND (NEW.data ->> 'state') IN (
          'pending',
          'approved',
          'rejected',
          'cancelled',
          'stale'
        )
        AND (NEW.data ->> 'content_digest') = (
          SELECT
            (data ->> 'content_digest')
          FROM
            intakes
          WHERE
            id = (NEW.data ->> 'source_intake_id')
        )
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_requests
BEFORE INSERT OR UPDATE ON requests FOR EACH ROW
EXECUTE FUNCTION guard_invariant_requests ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_releases () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        (NEW.data ->> 'asset_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'version_id') IS DISTINCT FROM NULL
        AND (NEW.data ->> 'request_id') IS DISTINCT FROM NULL
        AND ((NEW.data ->> 'release_seq')::bigint) >= 1
        AND jsonb_typeof(NEW.data -> 'applies_to') = 'object'
        AND EXISTS (
          SELECT
            1
          FROM
            sources
          WHERE
            id = (NEW.data ->> 'policy_source_id')
        )
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_releases
BEFORE INSERT OR UPDATE ON releases FOR EACH ROW
EXECUTE FUNCTION guard_invariant_releases ();
--> statement-breakpoint
CREATE FUNCTION guard_invariant_jobs () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        (NEW.data ->> 'state') IN (
          'queued',
          'running',
          'succeeded',
          'failed',
          'cancelled'
        )
        AND ((NEW.data ->> 'lease_epoch')::bigint) >= 0
      ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'domain invariant violated' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invariant_jobs
BEFORE INSERT OR UPDATE ON jobs FOR EACH ROW
EXECUTE FUNCTION guard_invariant_jobs ();
--> statement-breakpoint
CREATE FUNCTION guard_asset_identity_immutable () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (NEW.data ->> 'slug') <> (OLD.data ->> 'slug')
      OR (NEW.data ->> 'kind') <> (OLD.data ->> 'kind')
  THEN
    RAISE EXCEPTION 'asset identity immutable' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER asset_identity_immutable
BEFORE UPDATE ON assets FOR EACH ROW
EXECUTE FUNCTION guard_asset_identity_immutable ();
--> statement-breakpoint
CREATE FUNCTION guard_source_identity_immutable () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (NEW.data ->> 'canonical_url') IS DISTINCT FROM (OLD.data ->> 'canonical_url')
      OR (NEW.data ->> 'repository_identity') IS DISTINCT FROM (OLD.data ->> 'repository_identity')
      OR (NEW.data ->> 'provider') IS DISTINCT FROM (OLD.data ->> 'provider')
      OR (NEW.data ->> 'owner_group_id') <> (OLD.data ->> 'owner_group_id')
  THEN
    RAISE EXCEPTION 'source identity immutable' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER source_identity_immutable
BEFORE UPDATE ON sources FOR EACH ROW
EXECUTE FUNCTION guard_source_identity_immutable ();
--> statement-breakpoint
CREATE FUNCTION guard_scan_immutable () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'scan immutable' 
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER scan_immutable
BEFORE UPDATE ON scans FOR EACH ROW
EXECUTE FUNCTION guard_scan_immutable ();
--> statement-breakpoint
CREATE TRIGGER scan_keep
BEFORE DELETE ON scans FOR EACH ROW
EXECUTE FUNCTION guard_scan_immutable ();
--> statement-breakpoint
CREATE FUNCTION guard_request_keep () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'frozen request immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER request_keep
BEFORE DELETE ON requests FOR EACH ROW
EXECUTE FUNCTION guard_request_keep ();
--> statement-breakpoint
CREATE FUNCTION guard_request_decision_immutable () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.data ->> 'state' <> 'pending' THEN
    RAISE EXCEPTION 'resolved request immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER request_decision_immutable
BEFORE UPDATE ON requests FOR EACH ROW
EXECUTE FUNCTION guard_request_decision_immutable ();
--> statement-breakpoint
CREATE FUNCTION guard_request_policy_immutable () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    (
        NEW.data - ARRAY[
          'state',
          'decision_by',
          'decision_reason',
          'accepted_warnings',
          'decided_at',
          'revision',
          'stale_reason'
        ]::TEXT[]
      ) <> (
        OLD.data - ARRAY[
          'state',
          'decision_by',
          'decision_reason',
          'accepted_warnings',
          'decided_at',
          'revision',
          'stale_reason'
        ]::TEXT[]
      )
  THEN
    RAISE EXCEPTION 'frozen request immutable' 
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER request_policy_immutable
BEFORE UPDATE ON requests FOR EACH ROW
EXECUTE FUNCTION guard_request_policy_immutable ();
--> statement-breakpoint
CREATE FUNCTION bump_revision () RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE hub_revision SET revision = revision + 1 WHERE id = 1;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON groups FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON memberships FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON roles FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON role_bindings FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON sources FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON assets FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON bindings FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON versions FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON releases FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
--> statement-breakpoint
CREATE TRIGGER revision_changed
AFTER INSERT OR UPDATE OR DELETE ON scenarios FOR EACH STATEMENT
EXECUTE FUNCTION bump_revision ();
