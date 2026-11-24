DROP INDEX `evaluations_reuse`;--> statement-breakpoint
CREATE INDEX `evaluations_reuse` ON `resource_evaluations` (`subject_digest`,`rubric_version`) WHERE state in ('succeeded', 'partial');