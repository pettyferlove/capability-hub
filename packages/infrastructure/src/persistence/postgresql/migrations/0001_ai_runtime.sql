CREATE TABLE "ai_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_artifacts_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_calls_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "ai_effects" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_effects_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "ai_events" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_events_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "ai_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_executions_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "ai_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_interactions_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_messages_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "ai_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_snapshots_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "ai_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_threads_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "ai_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_traces_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_execution_id_ai_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_executions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_execution_id_ai_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_executions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "ai_effects" ADD CONSTRAINT "ai_effects_execution_id_ai_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_executions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_execution_id_ai_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_executions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_execution_id_ai_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_executions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_execution_id_ai_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_executions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "ai_snapshots" ADD CONSTRAINT "ai_snapshots_execution_id_ai_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_executions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "ai_threads" ADD CONSTRAINT "ai_threads_execution_id_ai_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_executions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "ai_traces" ADD CONSTRAINT "ai_traces_execution_id_ai_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_executions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "ai_artifacts_execution_position_idx" ON "ai_artifacts" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_artifacts_owner_position_idx" ON "ai_artifacts" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_artifacts_lookup_position_idx" ON "ai_artifacts" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_artifacts_status_position_idx" ON "ai_artifacts" USING btree ("status","position","id");--> statement-breakpoint
CREATE INDEX "ai_calls_execution_position_idx" ON "ai_calls" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_calls_owner_position_idx" ON "ai_calls" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_calls_lookup_position_idx" ON "ai_calls" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_calls_status_position_idx" ON "ai_calls" USING btree ("status","position","id");--> statement-breakpoint
CREATE INDEX "ai_effects_execution_position_idx" ON "ai_effects" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_effects_owner_position_idx" ON "ai_effects" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_effects_lookup_position_idx" ON "ai_effects" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_effects_status_position_idx" ON "ai_effects" USING btree ("status","position","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_effects_lookup_uq" ON "ai_effects" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ai_events_execution_position_idx" ON "ai_events" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_events_owner_position_idx" ON "ai_events" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_events_lookup_position_idx" ON "ai_events" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_events_status_position_idx" ON "ai_events" USING btree ("status","position","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_events_stream_seq_uq" ON "ai_events" USING btree ("lookup_key","position");--> statement-breakpoint
CREATE INDEX "ai_executions_execution_position_idx" ON "ai_executions" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_executions_owner_position_idx" ON "ai_executions" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_executions_lookup_position_idx" ON "ai_executions" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_executions_status_position_idx" ON "ai_executions" USING btree ("status","position","id");--> statement-breakpoint
CREATE INDEX "ai_interactions_execution_position_idx" ON "ai_interactions" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_interactions_owner_position_idx" ON "ai_interactions" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_interactions_lookup_position_idx" ON "ai_interactions" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_interactions_status_position_idx" ON "ai_interactions" USING btree ("status","position","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_interactions_lookup_uq" ON "ai_interactions" USING btree ("lookup_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_interactions_pending_uq" ON "ai_interactions" USING btree ("execution_id") WHERE "ai_interactions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "ai_messages_execution_position_idx" ON "ai_messages" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_messages_owner_position_idx" ON "ai_messages" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_messages_lookup_position_idx" ON "ai_messages" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_messages_status_position_idx" ON "ai_messages" USING btree ("status","position","id");--> statement-breakpoint
CREATE INDEX "ai_snapshots_execution_position_idx" ON "ai_snapshots" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_snapshots_owner_position_idx" ON "ai_snapshots" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_snapshots_lookup_position_idx" ON "ai_snapshots" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_snapshots_status_position_idx" ON "ai_snapshots" USING btree ("status","position","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_snapshots_lookup_uq" ON "ai_snapshots" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ai_threads_execution_position_idx" ON "ai_threads" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_threads_owner_position_idx" ON "ai_threads" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_threads_lookup_position_idx" ON "ai_threads" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_threads_status_position_idx" ON "ai_threads" USING btree ("status","position","id");--> statement-breakpoint
CREATE INDEX "ai_traces_execution_position_idx" ON "ai_traces" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_traces_owner_position_idx" ON "ai_traces" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_traces_lookup_position_idx" ON "ai_traces" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_traces_status_position_idx" ON "ai_traces" USING btree ("status","position","id");