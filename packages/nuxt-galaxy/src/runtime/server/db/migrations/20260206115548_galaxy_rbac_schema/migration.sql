CREATE SCHEMA "galaxy_rbac";
--> statement-breakpoint
CREATE TYPE "galaxy_rbac"."role_permissions_type" AS ENUM('workflows.insert', 'workflows.update', 'workflows.select', 'workflows.delete', 'instances.insert', 'instances.delete', 'instances.update', 'instances.select', 'users.select', 'users.insert', 'users.update', 'users.delete', 'roles.select', 'roles.insert', 'roles.update', 'roles.delete', 'role_permissions.select', 'role_permissions.insert', 'role_permissions.update', 'role_permissions.delete', 'tags.select', 'tags.insert', 'tags.update', 'tags.delete', 'user_roles.select', 'user_roles.insert', 'user_roles.update', 'user_roles.delete');--> statement-breakpoint
CREATE TYPE "galaxy_rbac"."role_type" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "galaxy_rbac"."role_permissions" (
	"id" serial PRIMARY KEY,
	"permission" "galaxy_rbac"."role_permissions_type" NOT NULL,
	"role_id" integer NOT NULL,
	CONSTRAINT "role_permissions_permission_role_id_unique" UNIQUE("permission","role_id")
);
--> statement-breakpoint
CREATE TABLE "galaxy_rbac"."roles" (
	"id" serial PRIMARY KEY,
	"name" "galaxy_rbac"."role_type" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "galaxy_rbac"."roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "galaxy_rbac"."user_roles" (
	"id" serial PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"role_id" integer NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_unique" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "galaxy_rbac"."user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "role_permissions_role_id_index" ON "galaxy_rbac"."role_permissions" ("role_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_index" ON "galaxy_rbac"."role_permissions" ("permission");--> statement-breakpoint
ALTER TABLE "galaxy_rbac"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "galaxy_rbac"."roles"("id");--> statement-breakpoint
ALTER TABLE "galaxy_rbac"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "galaxy_rbac"."user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "galaxy_rbac"."roles"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "Allow auth admin to read roles" ON "galaxy_rbac"."roles" AS PERMISSIVE FOR SELECT TO "supabase_auth_admin" USING (true);--> statement-breakpoint
CREATE POLICY "Allow auth admin to read user roles" ON "galaxy_rbac"."user_roles" AS PERMISSIVE FOR SELECT TO "supabase_auth_admin" USING (true);