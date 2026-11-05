CREATE OR REPLACE FUNCTION guard_version_keep() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM releases WHERE version_id = OLD.id)
    OR EXISTS (SELECT 1 FROM requests WHERE version_id = OLD.id AND data ->> 'state' IN ('pending', 'approved')) THEN
    RAISE EXCEPTION 'immutable version' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION guard_scan_keep() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM releases WHERE version_id = OLD.version_id)
    OR EXISTS (SELECT 1 FROM requests WHERE version_id = OLD.version_id AND data ->> 'state' IN ('pending', 'approved')) THEN
    RAISE EXCEPTION 'scan immutable' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
DROP TRIGGER scan_keep ON scans;
--> statement-breakpoint
CREATE TRIGGER scan_keep BEFORE DELETE ON scans FOR EACH ROW EXECUTE FUNCTION guard_scan_keep();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_request_keep() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.data ->> 'state' IN ('pending', 'approved')
    OR EXISTS (SELECT 1 FROM releases WHERE version_id = OLD.version_id) THEN
    RAISE EXCEPTION 'frozen request immutable' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
