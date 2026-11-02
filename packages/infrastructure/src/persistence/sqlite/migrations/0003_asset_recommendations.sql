CREATE TABLE `__new_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`user_id` text GENERATED ALWAYS AS (json_extract(data, '$.user_id')) STORED NOT NULL,
	`asset_id` text GENERATED ALWAYS AS (json_extract(data, '$.asset_id')) STORED NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recommendations_data_check" CHECK(( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1)
) STRICT;
--> statement-breakpoint
WITH ranked AS (
  SELECT r.id, r.data, v.asset_id,
    row_number() OVER (
      PARTITION BY r.user_id, v.asset_id
      -- UTC 整秒定长，小数秒去掉末尾零后可按文本精确排序。
      ORDER BY substr(json_extract(r.data, '$.created_at'), 1, 19),
               rtrim(substr(json_extract(r.data, '$.created_at'), 21), '0Z'), r.id
    ) AS position
  FROM recommendations r LEFT JOIN versions v ON v.id = r.version_id
)
INSERT INTO __new_recommendations (id, data)
SELECT id, json_set(json_remove(data, '$.version_id'), '$.asset_id', asset_id)
FROM ranked WHERE position = 1;
--> statement-breakpoint
DROP TABLE `recommendations`;--> statement-breakpoint
ALTER TABLE `__new_recommendations` RENAME TO `recommendations`;--> statement-breakpoint
CREATE UNIQUE INDEX `recommendations_user_id_asset_id_unique` ON `recommendations` (`user_id`,`asset_id`);
