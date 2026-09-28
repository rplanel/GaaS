-- #106: a re-sync compares the job state and `update_time` the invocation already reports
-- against the recorded row, and fetches the job only when they differ. Nullable, and no
-- backfill: a row written before this column has no recorded update time, which reads as
-- "unknown" and refetches once — the next sync records it.
ALTER TABLE "galaxy"."jobs" ADD COLUMN "update_time" timestamp with time zone;
