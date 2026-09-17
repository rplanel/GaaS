-- Custom SQL migration file, put your code below! --
-- Allow authenticated users to view storage objects that are linked to a dataset they own.
-- This is needed because output files uploaded by the galaxy:sync-analyses background task
-- use a service-role Supabase client, so storage.objects.owner does not match the end user.
CREATE POLICY "Users can view analysis files linked to their datasets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'analysis_files'
  AND EXISTS (
    SELECT 1 FROM galaxy.datasets
    WHERE datasets.storage_object_id = storage.objects.id
      AND datasets.owner_id = auth.uid()
  )
);

-- Backfill owner on existing output objects so they are also covered by the original
-- "Users can view their own files" policy.
UPDATE storage.objects o
SET owner = d.owner_id
FROM galaxy.datasets d
WHERE o.id = d.storage_object_id
  AND d.owner_id IS NOT NULL
  AND (o.owner IS NULL OR o.owner <> d.owner_id);