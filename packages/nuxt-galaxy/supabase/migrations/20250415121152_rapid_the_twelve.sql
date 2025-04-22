ALTER TABLE "galaxy"."workflows" ALTER COLUMN "version" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ALTER COLUMN "version" DROP DEFAULT;