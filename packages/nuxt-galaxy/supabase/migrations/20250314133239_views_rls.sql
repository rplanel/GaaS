ALTER VIEW IF EXISTS "galaxy"."uploaded_datasets_with_storage_path"
SET
  (security_invoker = true);

ALTER VIEW IF EXISTS
  "galaxy"."analysis_outputs_with_storage_path"
SET
  (security_invoker = true);

ALTER VIEW IF EXISTS
  "galaxy"."datasets_with_storage_path"
SET
  (security_invoker = true);

ALTER VIEW IF EXISTS
  "galaxy"."uploaded_datasets_with_storage_path"
SET
  (security_invoker = true);