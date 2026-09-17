CREATE TABLE "galaxy"."sync_locks" (
	"id" serial PRIMARY KEY,
	"analysis_id" integer NOT NULL UNIQUE,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "galaxy"."sync_locks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "galaxy"."sync_locks" ADD CONSTRAINT "sync_locks_analysis_id_analyses_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "galaxy"."analyses"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "Authenticated users can manage sync locks" ON "galaxy"."sync_locks" AS PERMISSIVE FOR ALL TO "authenticated" USING (true) WITH CHECK (true);