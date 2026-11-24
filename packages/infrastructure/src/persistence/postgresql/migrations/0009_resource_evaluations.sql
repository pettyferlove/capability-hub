CREATE TABLE "evaluation_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"window_start" bigint GENERATED ALWAYS AS (((data ->> 'window_start')::bigint)) STORED NOT NULL,
	"reserved" integer GENERATED ALWAYS AS (((data ->> 'reserved')::integer)) STORED NOT NULL,
	CONSTRAINT "evaluation_schedule_data_check" CHECK ((jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id) IS TRUE),
	CONSTRAINT "evaluation_schedule_singleton" CHECK (id = 'resource-evaluations')
);
--> statement-breakpoint
CREATE TABLE "resource_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"asset_id" text GENERATED ALWAYS AS ((data ->> 'asset_id')) STORED NOT NULL,
	"version_id" text GENERATED ALWAYS AS ((data ->> 'version_id')) STORED NOT NULL,
	"state" text GENERATED ALWAYS AS ((data ->> 'state')) STORED NOT NULL,
	"priority" integer GENERATED ALWAYS AS (((data ->> 'priority')::integer)) STORED NOT NULL,
	"requested_at" text GENERATED ALWAYS AS ((data ->> 'requested_at')) STORED NOT NULL,
	"rubric_version" text GENERATED ALWAYS AS ((data ->> 'rubric_version')) STORED NOT NULL,
	"subject_digest" text GENERATED ALWAYS AS ((data ->> 'subject_digest')) STORED NOT NULL,
	"evaluator_digest" text GENERATED ALWAYS AS ((data ->> 'evaluator_digest')) STORED,
	CONSTRAINT "resource_evaluations_data_check" CHECK ((jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "resource_evaluations" ADD CONSTRAINT "resource_evaluations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "resource_evaluations" ADD CONSTRAINT "resource_evaluations_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE INDEX "evaluations_queue" ON "resource_evaluations" USING btree ("state","priority" DESC NULLS LAST,"requested_at","id");
--> statement-breakpoint
CREATE INDEX "evaluations_version" ON "resource_evaluations" USING btree ("version_id","rubric_version");
--> statement-breakpoint
CREATE INDEX "evaluations_reuse" ON "resource_evaluations" USING btree ("subject_digest","rubric_version") WHERE state = 'succeeded';
--> statement-breakpoint
CREATE UNIQUE INDEX "evaluations_active_subject" ON "resource_evaluations" USING btree ("version_id","subject_digest","rubric_version",(coalesce(evaluator_digest, ''))) WHERE state in ('queued','running');
--> statement-breakpoint
CREATE FUNCTION guard_evaluation_terminal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'terminal evaluation immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER evaluation_terminal_immutable BEFORE UPDATE ON resource_evaluations
FOR EACH ROW WHEN (OLD.state IN ('succeeded', 'partial', 'failed', 'cancelled'))
EXECUTE FUNCTION guard_evaluation_terminal();
