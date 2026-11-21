CREATE TABLE "catalog_prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"next_refresh_at" bigint GENERATED ALWAYS AS (((data ->> 'next_refresh_at')::bigint)) STORED NOT NULL,
	"active_job_id" text GENERATED ALWAYS AS ((data ->> 'active_job_id')) STORED,
	CONSTRAINT "catalog_prompts_data_check" CHECK ((jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id) IS TRUE),
	CONSTRAINT "catalog_prompts_singleton" CHECK (id = 'catalog-prompts')
);
