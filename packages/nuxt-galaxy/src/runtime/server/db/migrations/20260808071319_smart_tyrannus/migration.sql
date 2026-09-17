-- Custom SQL migration file, put your code below! --
-- Add sync attempt tracking columns to analyses
ALTER TABLE "galaxy"."analyses"
  ADD COLUMN IF NOT EXISTS "sync_attempts" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_sync_error_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "next_sync_at" timestamp with time zone;

-- Atomic lock acquisition function
CREATE OR REPLACE FUNCTION "galaxy"."acquire_sync_lock"(
  p_analysis_id integer,
  p_ttl_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  now timestamp with time zone := now();
  expires_at timestamp with time zone := now + (p_ttl_seconds || ' seconds')::interval;
  inserted boolean;
BEGIN
  INSERT INTO "galaxy"."sync_locks" ("analysis_id", "locked_at", "expires_at")
  VALUES (p_analysis_id, now, expires_at)
  ON CONFLICT ("analysis_id") DO UPDATE
    SET "locked_at" = EXCLUDED."locked_at",
        "expires_at" = EXCLUDED."expires_at"
    WHERE "galaxy"."sync_locks"."expires_at" <= now
  RETURNING true INTO inserted;
  RETURN COALESCE(inserted, false);
END;
$$;