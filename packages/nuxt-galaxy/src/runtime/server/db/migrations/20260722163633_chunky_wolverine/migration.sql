ALTER TABLE "galaxy"."analyses" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "galaxy"."invocation_state";--> statement-breakpoint
CREATE TYPE "galaxy"."invocation_state" AS ENUM('cancelled', 'failed', 'completed', 'new', 'requires_materialization', 'ready', 'scheduled', 'cancelling');--> statement-breakpoint
ALTER TABLE "galaxy"."analyses" ALTER COLUMN "state" SET DATA TYPE "galaxy"."invocation_state" USING "state"::"galaxy"."invocation_state";