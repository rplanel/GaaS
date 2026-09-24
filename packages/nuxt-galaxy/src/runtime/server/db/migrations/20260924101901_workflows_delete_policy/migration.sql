-- ADR 0004: an administrator may delete a version no analysis references, the mistaken publish (#72).
-- A tag association from before ADR 0004 goes with its version: nothing writes workflows_to_tags any
-- more, and a stale row must not stand in the way of a delete the way an analysis does.
ALTER TABLE "galaxy"."workflows_to_tags" DROP CONSTRAINT "workflows_to_tags_workflow_id_workflows_id_fkey", ADD CONSTRAINT "workflows_to_tags_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "galaxy"."workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
-- The policy says who may delete: whoever holds workflows.delete, which the seed has given the admin
-- role from the start. Which versions may go is the foreign key's decision: analyses.workflow_id carries
-- no ON DELETE clause, so Postgres refuses (23503) while an analysis references the row, and the server
-- answers that refusal with a sentence pointing at retiring.
CREATE POLICY "Admin can delete workflows" ON "galaxy"."workflows" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT galaxy_rbac.authorize('workflows.delete')) = TRUE);