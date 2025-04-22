ALTER TABLE "galaxy"."workflows" RENAME COLUMN "version" TO "version_key";--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" DROP CONSTRAINT "workflows_galaxy_id_version_unique";--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ADD COLUMN "name_key" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ADD CONSTRAINT "workflows_version_key_name_key_unique" UNIQUE("version_key","name_key");--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ADD CONSTRAINT "workflows_galaxy_id_unique" UNIQUE("galaxy_id");