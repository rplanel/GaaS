ALTER TABLE "galaxy"."workflows" RENAME COLUMN "auto_version" TO "revision";--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ALTER COLUMN "revision" DROP DEFAULT;