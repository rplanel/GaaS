/**
 * Migration: Populate galaxy_metadata JSONB from existing columns
 * Phase 1: Backfill existing data
 * 
 * Run this AFTER deploying code changes (dual-write is active)
 */

BEGIN;

-- Step 1: Update existing rows with metadata from columns
UPDATE galaxy.datasets
SET galaxy_metadata = jsonb_build_object(
  'extension', extension,
  'data_lines', data_lines,
  'misc_blurb', misc_blurb
)
WHERE galaxy_metadata IS NULL
  OR galaxy_metadata = '{}';

-- Step 2: Verify all rows have metadata
SELECT 
  COUNT(*) as total_rows,
  COUNT(galaxy_metadata) as rows_with_metadata,
  COUNT(CASE WHEN galaxy_metadata = '{}' THEN 1 END) as empty_metadata
FROM galaxy.datasets;

-- Step 3: Show sample of migrated data
SELECT 
  id,
  extension,
  data_lines,
  misc_blurb,
  galaxy_metadata
FROM galaxy.datasets
LIMIT 5;

COMMIT;
