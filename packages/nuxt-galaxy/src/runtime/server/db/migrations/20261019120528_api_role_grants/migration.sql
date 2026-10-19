-- The API roles keep exactly the writes the application makes through a user's own session (#171). The
-- policies dropped here are for writes no grant below allows any more. The tag tables get row security:
-- a results view reads them through PostgREST embeddings, so each gets a read policy scoped through the
-- reader's own datasets, and workflows_to_tags, which nothing reads, gets none.
DROP POLICY "Authenticated users can create their own analysis" ON "galaxy"."analyses";--> statement-breakpoint
DROP POLICY "Users can delete their own analysis" ON "galaxy"."analyses";--> statement-breakpoint
DROP POLICY "Users can insert input datasets" ON "galaxy"."analysis_inputs";--> statement-breakpoint
DROP POLICY "Authenticated users can create their own monitoring rows" ON "galaxy"."analysis_monitoring";--> statement-breakpoint
DROP POLICY "Authenticated users can update their own monitoring rows" ON "galaxy"."analysis_monitoring";--> statement-breakpoint
DROP POLICY "Users can insert output datasets" ON "galaxy"."analysis_outputs";--> statement-breakpoint
DROP POLICY "Users can insert documents" ON "galaxy"."datasets";--> statement-breakpoint
DROP POLICY "Authenticated users can create their own history" ON "galaxy"."histories";--> statement-breakpoint
DROP POLICY "Users can update their own history" ON "galaxy"."histories";--> statement-breakpoint
DROP POLICY "Users can delete their own history" ON "galaxy"."histories";--> statement-breakpoint
DROP POLICY "Admin can insert instances" ON "galaxy"."instances";--> statement-breakpoint
DROP POLICY "Authenticated users can create their own jobs" ON "galaxy"."jobs";--> statement-breakpoint
DROP POLICY "Users can update their own jobs" ON "galaxy"."jobs";--> statement-breakpoint
DROP POLICY "Users can delete their own jobs" ON "galaxy"."jobs";--> statement-breakpoint
DROP POLICY "Users can insert maintenance windows" ON "galaxy"."maintenance_windows";--> statement-breakpoint
DROP POLICY "Authenticated users can manage sync locks" ON "galaxy"."sync_locks";--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_outputs_to_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "galaxy"."datasets_to_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "galaxy"."tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "galaxy"."workflows_to_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "Users can view the tags of their own outputs" ON "galaxy"."analysis_outputs_to_tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."analysis_outputs_to_tags"."analysis_output_id" IN (SELECT "galaxy"."analysis_outputs"."id" FROM "galaxy"."analysis_outputs" WHERE "galaxy"."analysis_outputs"."dataset_id" IN (SELECT "galaxy"."datasets"."id" FROM "galaxy"."datasets" WHERE "galaxy"."datasets"."owner_id" = (SELECT auth.uid()))));--> statement-breakpoint
CREATE POLICY "Users can view the tags of their own datasets" ON "galaxy"."datasets_to_tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."datasets_to_tags"."dataset_id" IN (SELECT "galaxy"."datasets"."id" FROM "galaxy"."datasets" WHERE "galaxy"."datasets"."owner_id" = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Users can view the tags of their own datasets and outputs" ON "galaxy"."tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."tags"."id" IN (SELECT tag_id FROM galaxy.datasets_to_tags) OR "galaxy"."tags"."id" IN (SELECT tag_id FROM galaxy.analysis_outputs_to_tags));--> statement-breakpoint
-- The grants, hand-written, since drizzle has no declaration for one. The schema-wide GRANT ALL of
-- 20260206135237 is narrowed the way 20260924090554 narrowed UPDATE on workflows: anon and authenticated
-- keep reading every table and view, under the same policies, and write only what the browser and the
-- session routes write. Every other write goes through a server route, with Drizzle, whose role owns every
-- table and is bound by no grant, or with the service role, whose grants stay as they are.
REVOKE ALL ON ALL TABLES IN SCHEMA "galaxy" FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA "galaxy" TO anon, authenticated;--> statement-breakpoint
-- The analysis list renames an analysis in the browser.
GRANT UPDATE ("name") ON TABLE "galaxy"."analyses" TO authenticated;--> statement-breakpoint
-- The Datasets page records an upload in the browser, once the file is in storage.
GRANT INSERT ON TABLE "galaxy"."uploaded_datasets" TO authenticated;--> statement-breakpoint
-- The admin routes publish, retire and delete a version through the administrator's session, under the
-- admin policies (ADR 0004), and "active" stays the one column an update may touch.
GRANT INSERT, DELETE ON TABLE "galaxy"."workflows" TO authenticated;--> statement-breakpoint
GRANT UPDATE ("active") ON TABLE "galaxy"."workflows" TO authenticated;--> statement-breakpoint
-- A serial id is drawn as the inserting role, so the two inserts keep their sequence.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "galaxy" FROM anon, authenticated;--> statement-breakpoint
GRANT USAGE ON SEQUENCE "galaxy"."uploaded_datasets_id_seq", "galaxy"."workflows_id_seq" TO authenticated;--> statement-breakpoint
-- No client calls a galaxy routine, and the server's one call goes through the service role. A routine
-- is executable by PUBLIC from its creation, and a schema's default privileges cannot take that back,
-- so a migration that adds one revokes it from PUBLIC itself.
REVOKE ALL ON ALL ROUTINES IN SCHEMA "galaxy" FROM PUBLIC, anon, authenticated;--> statement-breakpoint
-- What a later migration creates is the service role's alone until that migration grants the API roles
-- what they need.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "galaxy" REVOKE ALL ON TABLES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "galaxy" REVOKE ALL ON SEQUENCES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "galaxy" REVOKE ALL ON ROUTINES FROM anon, authenticated;
