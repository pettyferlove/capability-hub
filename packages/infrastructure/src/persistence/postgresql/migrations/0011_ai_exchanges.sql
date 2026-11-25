CREATE TABLE "ai_exchanges" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"owner_id" text GENERATED ALWAYS AS ((data ->> 'owner_id')) STORED NOT NULL,
	"execution_id" text GENERATED ALWAYS AS ((data ->> 'execution_id')) STORED NOT NULL,
	"lookup_key" text GENERATED ALWAYS AS ((data ->> 'lookup_key')) STORED NOT NULL,
	"status" text GENERATED ALWAYS AS ((data ->> 'status')) STORED NOT NULL,
	"created_at" text GENERATED ALWAYS AS ((data ->> 'created_at')) STORED NOT NULL,
	"updated_at" text GENERATED ALWAYS AS ((data ->> 'updated_at')) STORED NOT NULL,
	"position" bigint GENERATED ALWAYS AS (((data ->> 'position')::bigint)) STORED NOT NULL,
	CONSTRAINT "ai_exchanges_data_check" CHECK ((jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "ai_exchanges" ADD CONSTRAINT "ai_exchanges_execution_id_ai_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ai_executions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "ai_exchanges_execution_position_idx" ON "ai_exchanges" USING btree ("execution_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_exchanges_owner_position_idx" ON "ai_exchanges" USING btree ("owner_id","position","id");--> statement-breakpoint
CREATE INDEX "ai_exchanges_lookup_position_idx" ON "ai_exchanges" USING btree ("lookup_key","position","id");--> statement-breakpoint
CREATE INDEX "ai_exchanges_status_position_idx" ON "ai_exchanges" USING btree ("status","position","id");