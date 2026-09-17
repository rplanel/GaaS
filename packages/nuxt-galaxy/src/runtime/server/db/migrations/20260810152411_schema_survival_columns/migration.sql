ALTER TABLE "galaxy"."analysis_monitoring" ADD COLUMN "workflow_name" varchar(256);--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_monitoring" ADD COLUMN "galaxy_workflow_id" varchar(256);--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_monitoring" ADD COLUMN "workflow_version" varchar(255);--> statement-breakpoint
CREATE INDEX "idx_analysis_monitoring_owner_workflow" ON "galaxy"."analysis_monitoring" ("owner_id","workflow_id");--> statement-breakpoint
CREATE INDEX "idx_analysis_monitoring_owner_started_at" ON "galaxy"."analysis_monitoring" ("owner_id","started_at");
-- Backfill snapshot columns from local workflows (SCHE-03, D-06, D-07, D-10) — offline, deterministic.
UPDATE galaxy.analysis_monitoring am
SET workflow_name      = COALESCE(am.workflow_name, w.name),
    galaxy_workflow_id = COALESCE(am.galaxy_workflow_id, w.galaxy_id),
    workflow_version   = COALESCE(am.workflow_version, w.version_key)
FROM galaxy.workflows w
WHERE am.workflow_id = w.id
  AND (am.workflow_name IS NULL OR am.galaxy_workflow_id IS NULL OR am.workflow_version IS NULL);