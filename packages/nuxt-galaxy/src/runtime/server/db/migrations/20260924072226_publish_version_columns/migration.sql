-- ADR 0004: a version is a label published for one revision of one stored workflow, so the
-- one-row-per-stored-workflow rule gives way to one row per revision. The constraint keeps the
-- name Postgres gave it in the first migration, which is not the one the snapshot records.
ALTER TABLE "galaxy"."workflows" DROP CONSTRAINT "workflows_galaxy_id_key";--> statement-breakpoint
-- No production rows exist, so nothing migrates. A development database that already holds
-- versions keeps them: the export stored in "definition" carries the uuid of the revision it
-- was taken at, which is exactly what the new column holds.
ALTER TABLE "galaxy"."workflows" ADD COLUMN "revision_uuid" uuid;--> statement-breakpoint
UPDATE "galaxy"."workflows" SET "revision_uuid" = ("definition"->>'uuid')::uuid;--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ALTER COLUMN "revision_uuid" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ADD COLUMN "published_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ADD COLUMN "published_by" uuid;--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ADD CONSTRAINT "workflows_user_id_galaxy_id_revision_unique" UNIQUE("user_id","galaxy_id","revision");--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ADD CONSTRAINT "workflows_published_by_users_id_fkey" FOREIGN KEY ("published_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
