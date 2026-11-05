DROP TRIGGER version_keep;
--> statement-breakpoint
CREATE TRIGGER version_keep BEFORE DELETE ON versions
WHEN EXISTS (SELECT 1 FROM releases WHERE version_id = OLD.id)
  OR EXISTS (SELECT 1 FROM requests WHERE version_id = OLD.id AND json_extract(data, '$.state') IN ('pending', 'approved'))
BEGIN
  SELECT RAISE(ABORT, 'immutable version');
END;
--> statement-breakpoint
DROP TRIGGER scan_keep;
--> statement-breakpoint
CREATE TRIGGER scan_keep BEFORE DELETE ON scans
WHEN EXISTS (SELECT 1 FROM releases WHERE version_id = OLD.version_id)
  OR EXISTS (SELECT 1 FROM requests WHERE version_id = OLD.version_id AND json_extract(data, '$.state') IN ('pending', 'approved'))
BEGIN
  SELECT RAISE(ABORT, 'scan immutable');
END;
--> statement-breakpoint
DROP TRIGGER request_keep;
--> statement-breakpoint
CREATE TRIGGER request_keep BEFORE DELETE ON requests
WHEN json_extract(OLD.data, '$.state') IN ('pending', 'approved')
  OR EXISTS (SELECT 1 FROM releases WHERE version_id = OLD.version_id)
BEGIN
  SELECT RAISE(ABORT, 'frozen request immutable');
END;
