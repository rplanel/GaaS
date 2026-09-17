ALTER TABLE "galaxy"."datasets" ALTER COLUMN "storage_object_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "galaxy"."datasets" ALTER COLUMN "storage_path" DROP NOT NULL;
