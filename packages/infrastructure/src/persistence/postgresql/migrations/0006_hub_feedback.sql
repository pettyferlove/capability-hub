CREATE TABLE "hub_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"number" integer GENERATED ALWAYS AS (((data ->> 'number')::integer)) STORED NOT NULL,
	"submitted_by" text GENERATED ALWAYS AS ((data ->> 'submitted_by')) STORED NOT NULL,
	"channel" text GENERATED ALWAYS AS ((data ->> 'channel')) STORED NOT NULL,
	"kind" text GENERATED ALWAYS AS ((data ->> 'kind')) STORED NOT NULL,
	"surface" text GENERATED ALWAYS AS ((data ->> 'surface')) STORED NOT NULL,
	"area" text GENERATED ALWAYS AS ((data ->> 'area')) STORED,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"blocking" boolean GENERATED ALWAYS AS (((data ->> 'blocking')::boolean)) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"closed_at" text GENERATED ALWAYS AS ((data ->> 'closed_at')) STORED,
	"last_activity_at" text GENERATED ALWAYS AS ((data ->> 'last_activity_at')) STORED NOT NULL,
	"last_handler_public_at" text GENERATED ALWAYS AS ((data ->> 'last_handler_public_at')) STORED,
	"submitter_seen_at" text GENERATED ALWAYS AS ((data ->> 'submitter_seen_at')) STORED NOT NULL,
	"assignee_id" text GENERATED ALWAYS AS ((data ->> 'assignee_id')) STORED,
	"duplicate_of_id" text GENERATED ALWAYS AS ((data ->> 'duplicate_of_id')) STORED,
	"awaiting_reply" boolean GENERATED ALWAYS AS (((data ->> 'last_handler_public_at') IS NULL OR (data ->> 'last_handler_public_at') < (data ->> 'last_submitter_activity_at'))
        AND ((data ->> 'closed_at') IS NULL OR (data ->> 'last_submitter_activity_at') > (data ->> 'closed_at'))) STORED,
	CONSTRAINT "hub_feedback_number_unique" UNIQUE("number"),
	CONSTRAINT "hub_feedback_data_check" CHECK ((jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id) IS TRUE),
	CONSTRAINT "hub_feedback_number_positive" CHECK (number > 0)
);
--> statement-breakpoint
CREATE TABLE "hub_feedback_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"feedback_id" text GENERATED ALWAYS AS ((data ->> 'feedback_id')) STORED NOT NULL,
	"event_id" text GENERATED ALWAYS AS ((data ->> 'event_id')) STORED,
	"uploaded_by" text GENERATED ALWAYS AS ((data ->> 'uploaded_by')) STORED NOT NULL,
	"removed_by" text GENERATED ALWAYS AS ((data ->> 'removed_by')) STORED,
	"sha256" text GENERATED ALWAYS AS ((data ->> 'sha256')) STORED,
	"size" integer GENERATED ALWAYS AS (((data ->> 'size')::integer)) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	CONSTRAINT "hub_feedback_attachments_data_check" CHECK ((jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "hub_feedback_events" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"feedback_id" text GENERATED ALWAYS AS ((data ->> 'feedback_id')) STORED NOT NULL,
	"sequence" integer GENERATED ALWAYS AS (((data ->> 'sequence')::integer)) STORED NOT NULL,
	"kind" text GENERATED ALWAYS AS ((data ->> 'kind')) STORED NOT NULL,
	"actor_id" text GENERATED ALWAYS AS ((data ->> 'actor_id')) STORED,
	"visibility" text GENERATED ALWAYS AS ((data ->> 'visibility')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	CONSTRAINT "hub_feedback_events_feedback_id_sequence_unique" UNIQUE("feedback_id","sequence"),
	CONSTRAINT "hub_feedback_events_feedback_id_id_unique" UNIQUE("feedback_id","id"),
	CONSTRAINT "hub_feedback_events_data_check" CHECK ((jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id) IS TRUE),
	CONSTRAINT "hub_feedback_events_sequence_positive" CHECK (sequence > 0)
);
--> statement-breakpoint
ALTER TABLE "hub_feedback" ADD CONSTRAINT "hub_feedback_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "hub_feedback" ADD CONSTRAINT "hub_feedback_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "hub_feedback" ADD CONSTRAINT "hub_feedback_duplicate_of_id_hub_feedback_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."hub_feedback"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "hub_feedback_attachments" ADD CONSTRAINT "hub_feedback_attachments_feedback_id_hub_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."hub_feedback"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "hub_feedback_attachments" ADD CONSTRAINT "hub_feedback_attachments_feedback_id_event_id_hub_feedback_events_feedback_id_id_fk" FOREIGN KEY ("feedback_id","event_id") REFERENCES "public"."hub_feedback_events"("feedback_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "hub_feedback_attachments" ADD CONSTRAINT "hub_feedback_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "hub_feedback_attachments" ADD CONSTRAINT "hub_feedback_attachments_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "hub_feedback_events" ADD CONSTRAINT "hub_feedback_events_feedback_id_hub_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."hub_feedback"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "hub_feedback_events" ADD CONSTRAINT "hub_feedback_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "hub_feedback_submitter_created" ON "hub_feedback" USING btree ("submitted_by","created_at");--> statement-breakpoint
CREATE INDEX "hub_feedback_submitter_order" ON "hub_feedback" USING btree ("submitted_by","last_activity_at","number");--> statement-breakpoint
CREATE INDEX "hub_feedback_queue" ON "hub_feedback" USING btree ("blocking","last_activity_at","number");--> statement-breakpoint
CREATE INDEX "hub_feedback_status_queue" ON "hub_feedback" USING btree ("status","blocking","last_activity_at","number");--> statement-breakpoint
CREATE INDEX "hub_feedback_assignee" ON "hub_feedback" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "hub_feedback_closed" ON "hub_feedback" USING btree ("closed_at");--> statement-breakpoint
CREATE INDEX "hub_feedback_attachments_order" ON "hub_feedback_attachments" USING btree ("feedback_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_feedback_attachments_active" ON "hub_feedback_attachments" USING btree ("feedback_id") WHERE sha256 IS NOT NULL;--> statement-breakpoint
CREATE INDEX "hub_feedback_events_visibility" ON "hub_feedback_events" USING btree ("feedback_id","visibility","sequence");--> statement-breakpoint
CREATE INDEX "hub_feedback_events_actor_created" ON "hub_feedback_events" USING btree ("actor_id","kind","created_at");
--> statement-breakpoint
CREATE FUNCTION guard_hub_feedback_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.data -> 'number' IS DISTINCT FROM OLD.data -> 'number'
    OR NEW.data -> 'submitted_by' IS DISTINCT FROM OLD.data -> 'submitted_by'
    OR NEW.data -> 'channel' IS DISTINCT FROM OLD.data -> 'channel'
    OR NEW.data -> 'created_at' IS DISTINCT FROM OLD.data -> 'created_at'
  THEN
    RAISE EXCEPTION 'hub feedback identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hub_feedback_immutable BEFORE UPDATE ON hub_feedback
FOR EACH ROW EXECUTE FUNCTION guard_hub_feedback_update();
--> statement-breakpoint
CREATE FUNCTION guard_hub_feedback_event_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR jsonb_typeof(OLD.data -> 'redacted_at') IS DISTINCT FROM 'null'
    OR NEW.data ->> 'body' IS DISTINCT FROM ''
    OR jsonb_typeof(NEW.data -> 'redacted_at') IS DISTINCT FROM 'string'
    OR NEW.data - ARRAY['body', 'redacted_at'] IS DISTINCT FROM OLD.data - ARRAY['body', 'redacted_at']
  THEN
    RAISE EXCEPTION 'hub feedback event is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hub_feedback_events_immutable BEFORE UPDATE ON hub_feedback_events
FOR EACH ROW EXECUTE FUNCTION guard_hub_feedback_event_update();
--> statement-breakpoint
CREATE FUNCTION guard_hub_feedback_attachment_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  mutable_keys text[] := ARRAY['sha256', 'removed_at', 'removed_by', 'removal_reason'];
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR jsonb_typeof(OLD.data -> 'sha256') IS DISTINCT FROM 'string'
    OR jsonb_typeof(NEW.data -> 'sha256') IS DISTINCT FROM 'null'
    OR jsonb_typeof(NEW.data -> 'removed_at') IS DISTINCT FROM 'string'
    OR coalesce(NEW.data ->> 'removal_reason', '') NOT IN ('submitter', 'handler', 'retention')
    OR NEW.data - mutable_keys IS DISTINCT FROM OLD.data - mutable_keys
  THEN
    RAISE EXCEPTION 'hub feedback attachment is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hub_feedback_attachments_immutable BEFORE UPDATE ON hub_feedback_attachments
FOR EACH ROW EXECUTE FUNCTION guard_hub_feedback_attachment_update();
--> statement-breakpoint
CREATE FUNCTION prevent_hub_feedback_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'hub feedback rows cannot be deleted';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hub_feedback_no_delete BEFORE DELETE ON hub_feedback
FOR EACH ROW EXECUTE FUNCTION prevent_hub_feedback_delete();
--> statement-breakpoint
CREATE TRIGGER hub_feedback_events_no_delete BEFORE DELETE ON hub_feedback_events
FOR EACH ROW EXECUTE FUNCTION prevent_hub_feedback_delete();
--> statement-breakpoint
CREATE TRIGGER hub_feedback_attachments_no_delete BEFORE DELETE ON hub_feedback_attachments
FOR EACH ROW EXECUTE FUNCTION prevent_hub_feedback_delete();