-- galaxy.user holds the Galaxy service account the server runs every job as, and only the server reads
-- it, with Drizzle (#172). Row security stays on with no policy, so the API roles keep the SELECT every
-- galaxy table grants them and read no row.
DROP POLICY "Admin can view user" ON "galaxy"."user";