CREATE TABLE `catalog_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`next_refresh_at` integer GENERATED ALWAYS AS (json_extract(data, '$.next_refresh_at')) STORED NOT NULL,
	`active_job_id` text GENERATED ALWAYS AS (json_extract(data, '$.active_job_id')) STORED,
	CONSTRAINT "catalog_prompts_data_check" CHECK((json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id) IS 1),
	CONSTRAINT "catalog_prompts_singleton" CHECK(id = 'catalog-prompts')
) STRICT;
