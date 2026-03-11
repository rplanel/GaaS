ALTER TABLE "galaxy"."analyses" ALTER COLUMN "parameters" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "galaxy"."analyses" ALTER COLUMN "datamap" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "galaxy"."analyses" ALTER COLUMN "is_sync" DROP NOT NULL;