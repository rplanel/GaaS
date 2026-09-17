ALTER TYPE "galaxy"."invocation_state" ADD VALUE 'completed' BEFORE 'new';--> statement-breakpoint
ALTER TYPE "galaxy"."invocation_state" ADD VALUE 'requires_materialization' BEFORE 'ready';