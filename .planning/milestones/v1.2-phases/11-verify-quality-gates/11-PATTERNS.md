# Phase 11: Verify Quality Gates - Pattern Map

**Mapped:** 2026-08-10
**Files analyzed:** 2
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/ui/app/pages/analyses/[analysisId].vue` | component (page) | request-response | `packages/ui/app/pages/admin/workflows.vue` | exact |
| `packages/ui/app/pages/analyses/[analysisId].vue` | component (page) | request-response | `packages/ui/app/components/analysis/AnalysisListPanel.vue` | role-match |
| `11-VERIFICATION.md` (to be created) | documentation | batch | `.planning/phases/09-remove-client-side-sync-triggers-and-add-on-demand-path/09-VERIFICATION.md` | exact |

## Pattern Assignments

### `packages/ui/app/pages/analyses/[analysisId].vue` (component/page, request-response)

**Primary analog:** `packages/ui/app/pages/admin/workflows.vue`
**Secondary analog:** `packages/ui/app/components/analysis/AnalysisListPanel.vue`

**Imports pattern** (from target file, lines 1-7):
```typescript
<script setup lang="ts">
import type { Database } from 'nuxt-galaxy'
import { format } from 'date-fns'
import { useDefinedBreakpoints } from '../../composables/useDefinedBreakpoints'
```

**Core `$fetch` POST pattern** (from `admin/workflows.vue`, lines 103-119):
```typescript
async function addToDb(workflow: { id: string }) {
  const { id: galaxyId } = workflow
  try {
    await $fetch('/api/db/workflows', {
      method: 'POST',
      body: {
        galaxyId,
      },
    })
    router.push('/workflows')
  }
  catch (error) {
    showError({
      statusCode: bt.getStatusCode(error),
      statusMessage: bt.getErrorMessage(error),
    })
  }
}
```

**Toast + loading error-handling pattern** (from target file, lines 57-80):
```typescript
async function syncAnalysis() {
  isSyncing.value = true
  try {
    await $fetch(`/api/db/analyses/${analysisIdFromRoute.value}/sync`, { method: 'POST' })
    toast.add({
      title: 'Sync queued',
      description: 'The analysis sync has been queued.',
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
  }
  catch (error) {
    const { errorMessage } = useErrorMessage(error)
    toast.add({
      title: 'Sync failed',
      description: errorMessage.value || 'Sync request failed. Please try again or check the analysis status.',
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
  }
  finally {
    isSyncing.value = false
  }
}
```

**`@ts-expect-error` workaround pattern** (from `packages/nuxt-galaxy/src/module.ts`, line 178):
```typescript
// @ts-expect-error - supabase module options
this.options.supabase = defu(this.options.supabase || {}, {
  types: resolver.resolve('./runtime/types/database.ts'),
})
```

Apply this style directly before the failing `$fetch` call in `packages/ui/app/pages/analyses/[analysisId].vue` (line 60), e.g.:
```typescript
// @ts-expect-error — Nitro omits module-registered param-in-middle routes from layer-generated typed routes; runtime handler accepts POST
await $fetch(`/api/db/analyses/${analysisIdFromRoute.value}/sync`, { method: 'POST' })
```

**Callee route contract** (from `packages/nuxt-galaxy/src/module.ts`, lines 392-396):
```typescript
addServerHandler({
  route: '/api/db/analyses/:id/sync',
  handler: resolver.resolve('./runtime/server/api/db/analyses/[id]/sync.post'),
  method: 'post',
})
```

**Refresh-after-mutation pattern** (from `AnalysisListPanel.vue`, lines 137-149):
```typescript
async function deleteItem(item: SanitizedAnalysis) {
  try {
    await $fetch(`/api/db/analyses/${item.id}`, { method: 'DELETE' })
    refreshAnalyses()
    if (!refreshAnalysesList) {
      throw createError('refreshAnalysesList not provided')
    }
    refreshAnalysesList()
    toast.add({
      title: 'Analysis Deleted',
      description: 'The analysis has been deleted.',
    })
  }
  // ...
}
```

---

### `11-VERIFICATION.md` (documentation, batch)

**Analog:** `.planning/phases/09-remove-client-side-sync-triggers-and-add-on-demand-path/09-VERIFICATION.md`

**Frontmatter pattern** (lines 1-11):
```yaml
---
phase: 09-remove-client-side-sync-triggers-and-add-on-demand-path
verified: 2026-08-09T15:45:00Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps: []
human_verification: []
---
```

**Header / status block pattern** (lines 13-19):
```markdown
# Phase 09: Remove Client-Side Sync Triggers and Add On-Demand Path

**Phase Goal:** Eliminate unauthorized client-driven Galaxy sync triggers, document the Realtime display-only contract, and expose a server-owned on-demand sync path that enqueues the canonical scheduled task.

**Verified:** 2026-08-09T15:45:00Z
**Status:** passed
**Re-verification:** No — initial verification
```

**Section headings to replicate** (lines 21-122):
```markdown
## Goal Achievement

### Observable Truths
| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | ... | ✓ VERIFIED | file lines ... |

**Score:** X/X truths verified (...)

### Required Artifacts
| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| ... | ... | ... | ... |

### Key Link Verification
| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| ... | ... | ... | ... | ... |

### Data-Flow Trace (Level 4)
| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| ... | ... | ... | ... | ... |

### Behavioral Spot-Checks
| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| ... | ... | ... | ... |

### Requirements Coverage
| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ... | ... | ... | ... | ... |

### Anti-Patterns / Review Findings
| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | — | — | — | No ... markers ... |

### Notes
...

### Gaps Summary
...
```

---

## Shared Patterns

### Root quality gate invocation
**Source:** `package.json` (lines 10-17)
**Apply to:** Evidence table in `11-VERIFICATION.md`
```json
"scripts": {
  "test": "pnpm --filter './packages/**' test",
  "lint": "pnpm --filter './packages/**' lint",
  "typecheck": "pnpm --filter './packages/**' run typecheck",
}
```

### Vitest `threads` pool convention
**Source:** `vitest.config.ts` (lines 12-30)
**Apply to:** Test evidence notes; do not change any Vitest config during this phase
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Use threads pool to avoid forks-pool IPC write failures (errno -122 / EDQUOT)
    // in this runtime environment.
    pool: 'threads',
  },
})
```

### ESLint root configuration
**Source:** `eslint.config.mjs` (lines 1-11)
**Apply to:** Understanding why `pnpm lint` passes; no config change needed
```typescript
import antfu from '@antfu/eslint-config'

export default antfu({
  unocss: false,
  vue: true,
  ignores: [
    '**/.agents/**',
    '**/.planning/**',
    'packages/nuxt-galaxy/src/runtime/types/database.ts',
  ],
})
```

### `@ts-expect-error` comment style
**Source:** `packages/nuxt-galaxy/src/module.ts` (line 178)
**Apply to:** The single-line type workaround in `packages/ui/app/pages/analyses/[analysisId].vue`
```typescript
// @ts-expect-error - supabase module options
this.options.supabase = defu(this.options.supabase || {}, { ... })
```
Use a descriptive suffix that names the upstream quirk so the suppression is self-documenting.

## No Analog Found

None — every file to be created or modified has at least one strong codebase analog.

## Metadata

**Analog search scope:**
- `packages/ui/app/pages/**/*.vue`
- `packages/ui/app/components/**/*.vue`
- `packages/nuxt-galaxy/src/module.ts`
- `.planning/phases/*-VERIFICATION.md`
- Root `package.json`, `vitest.config.ts`, `eslint.config.mjs`

**Files scanned:** 5 analog sources
**Pattern extraction date:** 2026-08-10
