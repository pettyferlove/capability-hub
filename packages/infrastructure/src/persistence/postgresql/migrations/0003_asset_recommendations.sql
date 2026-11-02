ALTER TABLE "recommendations" DROP COLUMN "version_id";
--> statement-breakpoint
UPDATE recommendations AS r
SET data = (r.data - 'version_id') || jsonb_build_object('asset_id', v.asset_id)
FROM versions AS v WHERE v.id = r.data ->> 'version_id';
--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "asset_id" text GENERATED ALWAYS AS ((data ->> 'asset_id')) STORED NOT NULL;--> statement-breakpoint
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, asset_id
    -- UTC 整秒定长，小数秒去掉末尾零后可按文本精确排序。
    ORDER BY substr(data ->> 'created_at', 1, 19) COLLATE "C",
             rtrim(substr(data ->> 'created_at', 21), '0Z') COLLATE "C", id COLLATE "C"
  ) AS position
  FROM recommendations
)
DELETE FROM recommendations AS r USING ranked
WHERE r.id = ranked.id AND ranked.position > 1;
--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_asset_id_unique" UNIQUE("user_id","asset_id");
