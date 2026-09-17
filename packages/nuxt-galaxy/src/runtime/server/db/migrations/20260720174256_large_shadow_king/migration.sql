CREATE TYPE "galaxy"."monitoring_outcome" AS ENUM('pending', 'success', 'error', 'cancelled');--> statement-breakpoint
CREATE TABLE "galaxy"."analysis_monitoring" (
	"id" serial PRIMARY KEY,
	"analysis_id" integer,
	"owner_id" uuid NOT NULL,
	"workflow_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"outcome" "galaxy"."monitoring_outcome" DEFAULT 'pending'::"galaxy"."monitoring_outcome" NOT NULL,
	"galaxy_invocation_id" varchar(256) NOT NULL,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_monitoring" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_analysis_monitoring_owner_outcome" ON "galaxy"."analysis_monitoring" ("owner_id","outcome");--> statement-breakpoint
CREATE INDEX "idx_analysis_monitoring_outcome" ON "galaxy"."analysis_monitoring" ("outcome");--> statement-breakpoint
CREATE INDEX "idx_analysis_monitoring_galaxy_invocation_id" ON "galaxy"."analysis_monitoring" ("galaxy_invocation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_analysis_monitoring_analysis_id_unique" ON "galaxy"."analysis_monitoring" ("analysis_id") WHERE "analysis_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_monitoring" ADD CONSTRAINT "analysis_monitoring_analysis_id_analyses_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "galaxy"."analyses"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_monitoring" ADD CONSTRAINT "analysis_monitoring_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");--> statement-breakpoint
CREATE POLICY "Authenticated users can view their own monitoring rows" ON "galaxy"."analysis_monitoring" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."analysis_monitoring"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Admin can view all monitoring rows" ON "galaxy"."analysis_monitoring" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT galaxy_rbac.is_admin()) = TRUE);--> statement-breakpoint
CREATE POLICY "Authenticated users can create their own monitoring rows" ON "galaxy"."analysis_monitoring" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("galaxy"."analysis_monitoring"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Authenticated users can update their own monitoring rows" ON "galaxy"."analysis_monitoring" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("galaxy"."analysis_monitoring"."owner_id" = (select auth.uid())) WITH CHECK ("galaxy"."analysis_monitoring"."owner_id" = (select auth.uid()));