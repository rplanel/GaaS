-- ADR 0004: a version's row is immutable but for "active", and only an administrator flips it (#71).
-- The policy says who may update: whoever holds workflows.update, which the seed gives the admin role.
CREATE POLICY "Admin can update workflows" ON "galaxy"."workflows" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT galaxy_rbac.authorize('workflows.update')) = TRUE) WITH CHECK ((SELECT galaxy_rbac.authorize('workflows.update')) = TRUE);--> statement-breakpoint
-- The grant says what may be updated. The schema-wide GRANT ALL of 20260206135237 gave every API role
-- UPDATE on every column; it is taken back here and "active" alone is given, so that even an
-- administrator writing through the API cannot move a label, a revision or a snapshot. Retiring is
-- the users' session's act (the switch on the admin page), and service_role keeps the same one column
-- for a server-side caller; the server's own drizzle client connects as postgres, which the grant
-- does not bind. Drizzle has no declaration for a column-level grant, so this part is hand-written,
-- like the RBAC function migration.
REVOKE UPDATE ON TABLE "galaxy"."workflows" FROM anon, authenticated, service_role;--> statement-breakpoint
GRANT UPDATE ("active") ON TABLE "galaxy"."workflows" TO authenticated, service_role;
