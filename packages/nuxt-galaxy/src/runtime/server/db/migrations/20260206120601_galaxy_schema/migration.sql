CREATE SCHEMA "galaxy";
--> statement-breakpoint
CREATE TYPE "galaxy"."dataset_state" AS ENUM('ok', 'empty', 'error', 'discarded', 'failed_metadata', 'new', 'upload', 'queued', 'running', 'paused', 'setting_metadata', 'deferred');--> statement-breakpoint
CREATE TYPE "galaxy"."history_state" AS ENUM('new', 'upload', 'queued', 'running', 'ok', 'empty', 'error', 'paused', 'setting_metadata', 'failed_metadata', 'deferred', 'discarded');--> statement-breakpoint
CREATE TYPE "galaxy"."invocation_state" AS ENUM('cancelled', 'failed', 'scheduled', 'new', 'ready', 'cancelling');--> statement-breakpoint
CREATE TYPE "galaxy"."job_state" AS ENUM('deleted', 'deleting', 'error', 'ok', 'new', 'resubmitted', 'upload', 'waiting', 'queued', 'running', 'failed', 'paused', 'stop', 'stopped', 'skipped');--> statement-breakpoint
CREATE TABLE "galaxy"."analyses" (
	"id" serial PRIMARY KEY,
	"name" varchar(256) NOT NULL,
	"state" "galaxy"."invocation_state" NOT NULL,
	"parameters" json NOT NULL,
	"datamap" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" uuid NOT NULL,
	"history_id" integer NOT NULL UNIQUE,
	"workflow_id" integer NOT NULL,
	"galaxy_id" varchar(256) NOT NULL,
	"stderr" text,
	"stdout" text,
	"invocation" json NOT NULL,
	"is_sync" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "galaxy"."analyses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy"."analysis_inputs" (
	"id" serial PRIMARY KEY,
	"state" "galaxy"."dataset_state" NOT NULL,
	"dataset_id" integer NOT NULL UNIQUE,
	"analysis_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_inputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy"."analysis_outputs" (
	"id" serial PRIMARY KEY,
	"state" "galaxy"."dataset_state" NOT NULL,
	"dataset_id" integer NOT NULL,
	"analysis_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	CONSTRAINT "analysis_outputs_dataset_id_job_id_unique" UNIQUE("dataset_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_outputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy"."analysis_outputs_to_tags" (
	"analysis_output_id" integer,
	"tag_id" integer,
	CONSTRAINT "analysis_outputs_to_tags_pkey" PRIMARY KEY("analysis_output_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "galaxy"."datasets" (
	"id" serial PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"history_id" integer NOT NULL,
	"storage_object_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uuid" uuid NOT NULL UNIQUE,
	"extension" varchar(100) NOT NULL,
	"data_lines" integer,
	"misc_blurb" varchar(512),
	"dataset_name" varchar(256) NOT NULL,
	"galaxy_id" varchar(256) NOT NULL,
	"annotation" varchar(200),
	CONSTRAINT "datasets_history_id_galaxy_id_unique" UNIQUE("history_id","galaxy_id")
);
--> statement-breakpoint
ALTER TABLE "galaxy"."datasets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy"."datasets_to_tags" (
	"dataset_id" integer,
	"tag_id" integer,
	CONSTRAINT "datasets_to_tags_pkey" PRIMARY KEY("dataset_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "galaxy"."histories" (
	"id" serial PRIMARY KEY,
	"state" "galaxy"."history_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL,
	"owner_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"is_sync" boolean DEFAULT false NOT NULL,
	"galaxy_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"annotation" varchar(200)
);
--> statement-breakpoint
ALTER TABLE "galaxy"."histories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy"."instances" (
	"id" serial PRIMARY KEY,
	"url" varchar(256) NOT NULL UNIQUE,
	"name" varchar(100) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "galaxy"."instances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy"."jobs" (
	"id" serial PRIMARY KEY,
	"state" "galaxy"."job_state" NOT NULL,
	"tool_id" varchar(256) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exit_code" integer,
	"stdout" text,
	"stderr" text,
	"owner_id" uuid NOT NULL,
	"galaxy_id" varchar(256) NOT NULL UNIQUE,
	"step_id" integer NOT NULL,
	"analysis_id" integer NOT NULL,
	"is_sync" boolean DEFAULT false NOT NULL,
	CONSTRAINT "jobs_galaxy_id_analysis_id_unique" UNIQUE("galaxy_id","analysis_id")
);
--> statement-breakpoint
ALTER TABLE "galaxy"."jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy"."tags" (
	"id" serial PRIMARY KEY,
	"label" varchar(75) NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "galaxy"."uploaded_datasets" (
	"id" serial PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"dataset_name" text NOT NULL,
	"storage_object_id" uuid NOT NULL UNIQUE
);
--> statement-breakpoint
ALTER TABLE "galaxy"."uploaded_datasets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy"."user" (
	"id" serial PRIMARY KEY,
	"email" varchar(100) NOT NULL,
	"instance_id" integer NOT NULL,
	CONSTRAINT "user_email_instance_id_unique" UNIQUE("email","instance_id")
);
--> statement-breakpoint
ALTER TABLE "galaxy"."user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy"."workflows" (
	"id" serial PRIMARY KEY,
	"auto_version" integer DEFAULT 1 NOT NULL,
	"version_key" varchar(255) NOT NULL,
	"name_key" varchar(255) NOT NULL,
	"user_id" integer NOT NULL,
	"definition" json NOT NULL,
	"galaxy_id" varchar(256) NOT NULL UNIQUE,
	"name" varchar(256) NOT NULL,
	"annotation" varchar(200),
	CONSTRAINT "workflows_version_key_name_key_unique" UNIQUE("version_key","name_key")
);
--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy"."workflows_to_tags" (
	"workflow_id" integer,
	"tag_id" integer,
	CONSTRAINT "workflows_to_tags_pkey" PRIMARY KEY("workflow_id","tag_id")
);
--> statement-breakpoint
CREATE INDEX "analyses_owner_id_index" ON "galaxy"."analyses" ("owner_id");--> statement-breakpoint
CREATE INDEX "analyses_history_id_index" ON "galaxy"."analyses" ("history_id");--> statement-breakpoint
CREATE INDEX "analyses_workflow_id_index" ON "galaxy"."analyses" ("workflow_id");--> statement-breakpoint
CREATE INDEX "analyses_galaxy_id_index" ON "galaxy"."analyses" ("galaxy_id");--> statement-breakpoint
CREATE INDEX "analysis_inputs_dataset_id_index" ON "galaxy"."analysis_inputs" ("dataset_id");--> statement-breakpoint
CREATE INDEX "analysis_inputs_analysis_id_index" ON "galaxy"."analysis_inputs" ("analysis_id");--> statement-breakpoint
CREATE INDEX "analysis_outputs_dataset_id_index" ON "galaxy"."analysis_outputs" ("dataset_id");--> statement-breakpoint
CREATE INDEX "analysis_outputs_analysis_id_index" ON "galaxy"."analysis_outputs" ("analysis_id");--> statement-breakpoint
CREATE INDEX "analysis_outputs_job_id_index" ON "galaxy"."analysis_outputs" ("job_id");--> statement-breakpoint
CREATE INDEX "datasets_owner_id_index" ON "galaxy"."datasets" ("owner_id");--> statement-breakpoint
CREATE INDEX "datasets_history_id_index" ON "galaxy"."datasets" ("history_id");--> statement-breakpoint
CREATE INDEX "datasets_storage_object_id_index" ON "galaxy"."datasets" ("storage_object_id");--> statement-breakpoint
CREATE INDEX "datasets_galaxy_id_index" ON "galaxy"."datasets" ("galaxy_id");--> statement-breakpoint
CREATE INDEX "histories_user_id_index" ON "galaxy"."histories" ("user_id");--> statement-breakpoint
CREATE INDEX "histories_owner_id_index" ON "galaxy"."histories" ("owner_id");--> statement-breakpoint
CREATE INDEX "histories_galaxy_id_index" ON "galaxy"."histories" ("galaxy_id");--> statement-breakpoint
CREATE INDEX "jobs_owner_id_index" ON "galaxy"."jobs" ("owner_id");--> statement-breakpoint
CREATE INDEX "jobs_analysis_id_index" ON "galaxy"."jobs" ("analysis_id");--> statement-breakpoint
CREATE INDEX "jobs_galaxy_id_index" ON "galaxy"."jobs" ("galaxy_id");--> statement-breakpoint
CREATE INDEX "uploaded_datasets_owner_id_index" ON "galaxy"."uploaded_datasets" ("owner_id");--> statement-breakpoint
CREATE INDEX "uploaded_datasets_storage_object_id_index" ON "galaxy"."uploaded_datasets" ("storage_object_id");--> statement-breakpoint
ALTER TABLE "galaxy"."analyses" ADD CONSTRAINT "analyses_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."analyses" ADD CONSTRAINT "analyses_history_id_histories_id_fkey" FOREIGN KEY ("history_id") REFERENCES "galaxy"."histories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."analyses" ADD CONSTRAINT "analyses_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "galaxy"."workflows"("id");--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_inputs" ADD CONSTRAINT "analysis_inputs_dataset_id_datasets_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "galaxy"."datasets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_inputs" ADD CONSTRAINT "analysis_inputs_analysis_id_analyses_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "galaxy"."analyses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_outputs" ADD CONSTRAINT "analysis_outputs_dataset_id_datasets_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "galaxy"."datasets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_outputs" ADD CONSTRAINT "analysis_outputs_analysis_id_analyses_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "galaxy"."analyses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_outputs" ADD CONSTRAINT "analysis_outputs_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "galaxy"."jobs"("id");--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_outputs_to_tags" ADD CONSTRAINT "analysis_outputs_to_tags_fYukbuGjHKjM_fkey" FOREIGN KEY ("analysis_output_id") REFERENCES "galaxy"."analysis_outputs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."analysis_outputs_to_tags" ADD CONSTRAINT "analysis_outputs_to_tags_tag_id_tags_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "galaxy"."tags"("id");--> statement-breakpoint
ALTER TABLE "galaxy"."datasets" ADD CONSTRAINT "datasets_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."datasets" ADD CONSTRAINT "datasets_history_id_histories_id_fkey" FOREIGN KEY ("history_id") REFERENCES "galaxy"."histories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."datasets" ADD CONSTRAINT "datasets_storage_object_id_objects_id_fkey" FOREIGN KEY ("storage_object_id") REFERENCES "storage"."objects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."datasets_to_tags" ADD CONSTRAINT "datasets_to_tags_dataset_id_datasets_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "galaxy"."datasets"("id");--> statement-breakpoint
ALTER TABLE "galaxy"."datasets_to_tags" ADD CONSTRAINT "datasets_to_tags_tag_id_tags_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "galaxy"."tags"("id");--> statement-breakpoint
ALTER TABLE "galaxy"."histories" ADD CONSTRAINT "histories_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "galaxy"."user"("id");--> statement-breakpoint
ALTER TABLE "galaxy"."histories" ADD CONSTRAINT "histories_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."jobs" ADD CONSTRAINT "jobs_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."jobs" ADD CONSTRAINT "jobs_analysis_id_analyses_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "galaxy"."analyses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."uploaded_datasets" ADD CONSTRAINT "uploaded_datasets_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."uploaded_datasets" ADD CONSTRAINT "uploaded_datasets_storage_object_id_objects_id_fkey" FOREIGN KEY ("storage_object_id") REFERENCES "storage"."objects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."user" ADD CONSTRAINT "user_instance_id_instances_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "galaxy"."instances"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."workflows" ADD CONSTRAINT "workflows_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "galaxy"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy"."workflows_to_tags" ADD CONSTRAINT "workflows_to_tags_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "galaxy"."workflows"("id");--> statement-breakpoint
ALTER TABLE "galaxy"."workflows_to_tags" ADD CONSTRAINT "workflows_to_tags_tag_id_tags_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "galaxy"."tags"("id");--> statement-breakpoint
CREATE VIEW "galaxy"."datasets_with_storage_path" WITH (security_invoker = true) AS (select "galaxy"."datasets"."owner_id", "galaxy"."datasets"."history_id", "galaxy"."datasets"."storage_object_id", "storage"."objects"."created_at", "galaxy"."datasets"."uuid", "galaxy"."datasets"."extension", "galaxy"."datasets"."data_lines", "galaxy"."datasets"."misc_blurb", "galaxy"."datasets"."dataset_name", "galaxy"."datasets"."galaxy_id", "galaxy"."datasets"."annotation", "storage"."objects"."id", "storage"."objects"."name", "storage"."objects"."metadata", "storage"."objects"."bucket_id", "storage"."objects"."owner" from "galaxy"."datasets" inner join "storage"."objects" on "galaxy"."datasets"."storage_object_id" = "storage"."objects"."id");--> statement-breakpoint
CREATE VIEW "galaxy"."uploaded_datasets_with_storage_path" WITH (security_invoker = true) AS (select "galaxy"."uploaded_datasets"."id", "galaxy"."uploaded_datasets"."owner_id", "galaxy"."uploaded_datasets"."dataset_name", "galaxy"."uploaded_datasets"."storage_object_id", "storage"."objects"."metadata" from "galaxy"."uploaded_datasets" inner join "storage"."objects" on "galaxy"."uploaded_datasets"."storage_object_id" = "storage"."objects"."id");--> statement-breakpoint
CREATE VIEW "galaxy"."analysis_inputs_with_storage_path" WITH (security_invoker = true) AS (select "galaxy"."datasets"."id", "galaxy"."analysis_inputs"."state", "galaxy"."analysis_inputs"."dataset_id", "galaxy"."analysis_inputs"."analysis_id", "galaxy"."datasets"."owner_id", "galaxy"."datasets"."history_id", "galaxy"."datasets"."storage_object_id", "galaxy"."datasets"."created_at", "galaxy"."datasets"."uuid", "galaxy"."datasets"."extension", "galaxy"."datasets"."data_lines", "galaxy"."datasets"."misc_blurb", "galaxy"."datasets"."dataset_name", "galaxy"."datasets"."galaxy_id", "galaxy"."datasets"."annotation", "storage"."objects"."name", "storage"."objects"."metadata" from "galaxy"."analysis_inputs" inner join "galaxy"."datasets" on "galaxy"."analysis_inputs"."dataset_id" = "galaxy"."datasets"."id" inner join "storage"."objects" on "galaxy"."datasets"."storage_object_id" = "storage"."objects"."id");--> statement-breakpoint
CREATE VIEW "galaxy"."analysis_outputs_with_storage_path" WITH (security_invoker = true) AS (select "galaxy"."datasets"."id", "galaxy"."analysis_outputs"."state", "galaxy"."analysis_outputs"."dataset_id", "galaxy"."analysis_outputs"."analysis_id", "galaxy"."analysis_outputs"."job_id", "galaxy"."datasets"."owner_id", "galaxy"."datasets"."history_id", "galaxy"."datasets"."storage_object_id", "galaxy"."datasets"."created_at", "galaxy"."datasets"."uuid", "galaxy"."datasets"."extension", "galaxy"."datasets"."data_lines", "galaxy"."datasets"."misc_blurb", "galaxy"."datasets"."dataset_name", "galaxy"."datasets"."galaxy_id", "galaxy"."datasets"."annotation", "storage"."objects"."name", "storage"."objects"."metadata" from "galaxy"."analysis_outputs" inner join "galaxy"."datasets" on "galaxy"."analysis_outputs"."dataset_id" = "galaxy"."datasets"."id" inner join "storage"."objects" on "galaxy"."datasets"."storage_object_id" = "storage"."objects"."id");--> statement-breakpoint
CREATE POLICY "Authenticated users can create their own analysis" ON "galaxy"."analyses" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("galaxy"."analyses"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can view their own analysis" ON "galaxy"."analyses" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."analyses"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can update their own analysis" ON "galaxy"."analyses" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("galaxy"."analyses"."owner_id" = (select auth.uid())) WITH CHECK ("galaxy"."analyses"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can delete their own analysis" ON "galaxy"."analyses" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("galaxy"."analyses"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "User can see their own input data" ON "galaxy"."analysis_inputs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."analysis_inputs"."dataset_id" IN (SELECT "galaxy"."datasets"."id" FROM "galaxy"."datasets" WHERE "galaxy"."datasets"."owner_id" = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Users can insert input datasets" ON "galaxy"."analysis_inputs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("galaxy"."analysis_inputs"."dataset_id" IN (SELECT "galaxy"."datasets"."id" FROM "galaxy"."datasets" WHERE "galaxy"."datasets"."owner_id" = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "User can see their own output data" ON "galaxy"."analysis_outputs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."analysis_outputs"."dataset_id" IN (SELECT "galaxy"."datasets"."id" FROM "galaxy"."datasets" WHERE "galaxy"."datasets"."owner_id" = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Users can insert output datasets" ON "galaxy"."analysis_outputs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("galaxy"."analysis_outputs"."dataset_id" IN (SELECT "galaxy"."datasets"."id" FROM "galaxy"."datasets" WHERE "galaxy"."datasets"."owner_id" = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Users can insert documents" ON "galaxy"."datasets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("galaxy"."datasets"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can query their own documents" ON "galaxy"."datasets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."datasets"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Authenticated users can create their own history" ON "galaxy"."histories" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("galaxy"."histories"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can view their own history" ON "galaxy"."histories" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."histories"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can update their own history" ON "galaxy"."histories" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("galaxy"."histories"."owner_id" = (select auth.uid())) WITH CHECK ("galaxy"."histories"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can delete their own history" ON "galaxy"."histories" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("galaxy"."histories"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can query instances" ON "galaxy"."instances" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Admin can insert instances" ON "galaxy"."instances" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT galaxy_rbac.authorize('instances.insert')) = TRUE);--> statement-breakpoint
CREATE POLICY "Authenticated users can create their own jobs" ON "galaxy"."jobs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("galaxy"."jobs"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can view their own jobs" ON "galaxy"."jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."jobs"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can update their own jobs" ON "galaxy"."jobs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("galaxy"."jobs"."owner_id" = (select auth.uid())) WITH CHECK ("galaxy"."jobs"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can delete their own jobs" ON "galaxy"."jobs" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("galaxy"."jobs"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can insert datasets" ON "galaxy"."uploaded_datasets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("galaxy"."uploaded_datasets"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can query their own uploaded datasets" ON "galaxy"."uploaded_datasets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("galaxy"."uploaded_datasets"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "Admin can view user" ON "galaxy"."user" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT galaxy_rbac.authorize('users.select')) = TRUE);--> statement-breakpoint
CREATE POLICY "Users can query workflows" ON "galaxy"."workflows" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Admin can insert workflows" ON "galaxy"."workflows" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT galaxy_rbac.authorize('workflows.insert')) = TRUE);