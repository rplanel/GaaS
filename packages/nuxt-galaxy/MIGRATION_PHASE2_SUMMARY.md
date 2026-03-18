# Phase 2 Migration Summary: JSONB-Only Data Storage

## Overview
Successfully migrated from dual-write (old columns + JSONB) to JSONB-only storage for dataset metadata fields: `extension`, `data_lines`, and `misc_blurb`.

## Schema Changes

### Removed Columns
- ❌ `extension` (varchar - old column)
- ❌ `dataLines` (integer - old column)
- ❌ `miscBlurb` (varchar - old column)

### Added/Modified Columns
- ✅ `galaxyMetadata` (jsonb) - **Required field** with TypeScript type safety

## TypeScript Interface

```typescript
export interface GalaxyDatasetMetadata {
  extension: string // Required
  data_lines?: number // Optional
  misc_blurb?: string // Optional
  peek?: string // Optional - file preview from Galaxy API
}
```

## Files Modified

### 1. Schema Definition
**File:** `src/runtime/server/db/schema/galaxy/datasets.ts`
- Added `GalaxyDatasetMetadata` interface
- Removed `extension`, `dataLines`, `miscBlurb` columns
- Kept `galaxyMetadata` column with type annotation

### 2. Database Views
**File:** `src/runtime/server/db/schema/galaxy/views.ts`
- Views now return the complete `galaxyMetadata` JSONB object
- Individual field extraction removed (breaking change)
- UI components must access fields via: `dataset.galaxyMetadata?.misc_blurb`

**Views affected:**
- `analysis_inputs_with_storage_path`
- `analysis_outputs_with_storage_path`

### 3. Input Handler
**File:** `src/runtime/server/utils/grizzle/datasets/input.ts`
- Removed dual-write logic from `insertDatasetEffect` calls
- Updated `updateDatasetBlurbEffect` to update only `galaxyMetadata`
- All inserts now use JSONB-only structure

### 4. Output Handler
**File:** `src/runtime/server/utils/grizzle/datasets/output.ts`
- Removed dual-write from dataset insertion operations
- Updated to use `galaxyMetadata` only

### 5. Main Datasets Operations
**File:** `src/runtime/server/utils/grizzle/datasets.ts`
- Removed references to old columns in insert operations
- Updated to use `galaxyMetadata` with required `extension` field

## Migration SQL Script

**File:** `supabase/migrations/20240317_drop_old_columns_phase2.sql`

Purpose: Drop old columns from database after migration

**⚠️ IMPORTANT:** Run this only AFTER:
1. All data has been migrated to `galaxy_metadata`
2. Application has been updated to write to JSONB only
3. Views have been updated to read from JSONB

## Breaking Changes

### For Phase 1 to Phase 2
- Old columns (`extension`, `data_lines`, `misc_blurb`) no longer exist
- All code must read from `galaxyMetadata` JSONB
- Database views provide backward-compatible field access

### Benefits
1. **Cleaner schema** - Single JSONB column instead of 3 separate columns
2. **Type safety** - TypeScript interface enforces structure
3. **Flexible** - Easy to add new metadata fields to JSONB
4. **Galaxy API compatible** - Uses snake_case matching Galaxy API

## Next Steps

### Before deploying:
1. **Apply database migration**:
   ```bash
   cd packages/nuxt-galaxy
   pnpm supabase migration up
   ```

2. **Rebuild module**:
   ```bash
   pnpm dev:prepare
   ```

3. **Regenerate types**:
   ```bash
   pnpm supabase:generate:types
   ```

4. **Run tests**:
   ```bash
   pnpm test
   ```

### Verification:
- Check database schema: `pnpm supabase db dump --schema-only`
- Verify views return correct data types
- Test dataset upload/download flows

## UI Compatibility

**Breaking Change:** UI components must be updated because:
- Views no longer extract individual fields (e.g., `misc_blurb`, `extension`)
- UI must access fields via `dataset.galaxyMetadata?.misc_blurb`
- **Updated:** `packages/ui/app/components/galaxy/analysis/IoDataset.vue`

### Migration Guide for UI:
```vue
<!-- Before -->
<UBadge v-if="dataset?.misc_blurb">
{{ dataset.misc_blurb }}
</UBadge>

<!-- After -->
<UBadge v-if="dataset?.galaxyMetadata?.misc_blurb">
  {{ dataset.galaxyMetadata.misc_blurb }}
</UBadge>
```

## Rollback Plan

If issues occur:
1. Restore from database backup
2. Revert code changes: `git revert <commit>`
3. Reapply Phase 1 migration if needed

## Status

✅ Views simplified - only return `galaxyMetadata` JSONB object
✅ UI component updated (`IoDataset.vue`)
✅ Documentation updated with breaking changes
⏳ Pending: Regenerate types and run tests
⏳ Pending: Database migration execution (Phase 2 follow-up)

---

**Ready for database migration and deployment!**
