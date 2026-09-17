# Phase 03: Fix `@gaas/ui` TypeScript Errors - Pattern Map

**Mapped:** 2026-08-05
**Files analyzed:** 4
**Analogs found:** 2 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/ui/app/components/HeroShadersDynamic.vue` | component | request-response | none (only async `.client.vue` wrapper in the layer) | no-analog |
| `packages/ui/app/components/HeroShaders.client.vue` | component | request-response | none (only shader `.client.vue` component) | no-analog |
| `packages/ui/app/components/plot/Table.vue` | component | CRUD / reactive | `packages/ui/app/components/meili/index/DataTable.vue` | exact |
| `packages/ui/app/pages/index.vue` | page (component) | request-response | `packages/ui/app/components/BadgeGroup.vue` (conditional `UButton` guard) | partial |

## Pattern Assignments

### `packages/ui/app/components/HeroShadersDynamic.vue` (component, request-response)

**Analog:** none (no other dynamic `.client.vue` wrapper exists).

This file is the only async wrapper for a `.client.vue` shader component. The type fix changes the dynamic import path from a Nuxt alias to a relative path so `vue-tsc` resolves the real file while Nuxt still treats `HeroShaders.client.vue` as client-only.

**Current import / render pattern** (lines 1-9):
```vue
<script setup lang="ts">
const HeroShaders = defineAsyncComponent(() =>
  import('~/components/HeroShaders.client.vue'),
)
</script>

<template>
  <component :is="HeroShaders" v-bind="$attrs" />
</template>
```

**Pattern to apply** (from phase decision D-01):
```typescript
const HeroShaders = defineAsyncComponent(() =>
  import('./HeroShaders.client.vue'),
)
```

---

### `packages/ui/app/components/HeroShaders.client.vue` (component, request-response)

**Analog:** none (unique shader component).

This file is the client-only shader implementation. The phase boundary requires preserving its runtime behavior; no type-level pattern changes are currently specified.

**Current import pattern** (lines 1-3):
```vue
<script setup lang="ts">
import { Pixelate, Plasma, Shader, SineWave } from 'shaders/vue'
</script>
```

**Pattern to preserve** (lines 5-43):
Keep the existing `<Shader>` / `<Pixelate>` / `<Plasma>` / `<SineWave>` markup exactly. The dynamic-import wrapper fix in `HeroShadersDynamic.vue` is what resolves the TypeScript module-resolution issue.

---

### `packages/ui/app/components/plot/Table.vue` (component, CRUD / reactive)

**Primary analog:** `packages/ui/app/components/meili/index/DataTable.vue`
**Secondary analog:** `packages/ui/app/components/table/Generic.vue`

**Imports pattern** (from `meili/index/DataTable.vue`, lines 1-14):
```vue
<script lang="ts" generic="T">
</script>

<script lang="ts" setup generic="T">
import type { TableProps, TabsItem } from '@nuxt/ui'
import type { ColumnPinningState, ExpandedState, SortingState, Table, VisibilityState } from '@tanstack/table-core'
import type { FacetDistribution, FacetStats, Filter } from 'meilisearch'
```

**Generic `defineModel` pattern** (from `meili/index/DataTable.vue`, lines 33-36):
```typescript
const columnPinning = defineModel<ColumnPinningState>('columnPinning')
const columnVisibility = defineModel<VisibilityState>('columnVisibility')
const expanded = defineModel<ExpandedState>('expanded')
```

Apply to `plot/Table.vue` line 16 as:
```typescript
const columnVisibility = defineModel<Record<string, boolean>>('columnVisibility', {
  default: () => ({}),
})
```

**Typed `useTemplateRef<{ tableApi: Table<T> }>` pattern** (from `meili/index/DataTable.vue`, line 37):
```typescript
const tableElem = useTemplateRef<{ tableApi: Table<T> }>('tableElem')
```

`plot/Table.vue` already uses this exact line at line 29; preserve it.

**`UTable` `v-model:column-visibility` usage pattern** (from `meili/index/DataTable.vue`, lines 325-329):
```vue
<UTable
  v-bind="computedTableProps" ref="tableElem" v-model:sorting="sortingState"
  v-model:column-pinning="columnPinning" v-model:column-visibility="columnVisibility"
  v-model:expanded="expanded" class="flex-1 table-fixed"
>
```

**Optional-chained `tableApi` pagination access** (from `table/Generic.vue`, lines 68-74):
```vue
<UPagination
  :page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
  :items-per-page="table?.tableApi?.getState().pagination.pageSize"
  :total="table?.tableApi?.getFilteredRowModel().rows.length"
  @update:page="(p) => table?.tableApi?.setPageIndex(p - 1)"
/>
```

`plot/Table.vue` lines 97-101 already mirror this; preserve the existing optional-chaining structure.

---

### `packages/ui/app/pages/index.vue` (page, request-response)

**Analog:** `packages/ui/app/components/BadgeGroup.vue` (conditional `UButton` guard)

**Current `useClipboard` pattern** (lines 1-3, 23, 337-346):
```vue
<script setup lang="ts">
import { useClipboard } from '@vueuse/core'

// ...

const { copy, copied } = useClipboard()
</script>

<template>
  <!-- ... -->
  <UButton
    :label="page.cta.command"
    :trailing-icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
    color="neutral"
    variant="subtle"
    class="font-mono font-light text-toned gap-4"
    size="xl"
    :ui="{ trailingIcon: 'size-5' }"
    @click="copy(page.cta.command)"
  />
</template>
```

**Conditional `UButton` guard pattern** (from `BadgeGroup.vue`, line 80):
```vue
<UButton v-if="all" variant="link" size="xs" @click="all = false">
  Show Less
</UButton>
```

**Pattern to apply** (from phase decision D-04):
```vue
<UButton
  v-if="page.cta.command"
  :label="page.cta.command"
  :trailing-icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
  color="neutral"
  variant="subtle"
  class="font-mono font-light text-toned gap-4"
  size="xl"
  :ui="{ trailingIcon: 'size-5' }"
  @click="copy(page.cta.command)"
/>
```

This keeps the button hidden when `page.cta.command` is `undefined`, avoiding an invalid `ClipboardValue` argument to `copy()`.

---

## Shared Patterns

### Generic Vue Component Declaration
**Source:** `packages/ui/app/components/plot/Table.vue` (line 1) and `packages/ui/app/components/meili/index/DataTable.vue` (lines 1-4)
**Apply to:** All generic table/visualization components
```vue
<script lang="ts" setup generic="T">
```

### Type-Only Imports First
**Source:** `packages/ui/app/components/plot/Table.vue` (lines 2-4) and `packages/ui/app/components/meili/index/DataTable.vue` (lines 5-8)
**Apply to:** All new `.vue` files in `@gaas/ui`
```typescript
import type { AccessorKeyColumnDef, Table } from '@tanstack/vue-table'
import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import type { ExprValue } from '@uwdata/mosaic-sql'
import { getPaginationRowModel } from '@tanstack/vue-table'
```

### Named Generic `defineModel`
**Source:** `packages/ui/app/components/meili/index/DataTable.vue` (lines 33-36)
**Apply to:** Components exposing v-model to parents
```typescript
const columnPinning = defineModel<ColumnPinningState>('columnPinning')
const columnVisibility = defineModel<VisibilityState>('columnVisibility')
const expanded = defineModel<ExpandedState>('expanded')
```

### Typed `useTemplateRef` for `UTable` `tableApi`
**Source:** `packages/ui/app/components/meili/index/DataTable.vue` (line 37)
**Apply to:** Any component that introspects a `UTable` instance
```typescript
const tableElem = useTemplateRef<{ tableApi: Table<T> }>('tableElem')
```

### Optional-Chained `tableApi` Pagination Introspection
**Source:** `packages/ui/app/components/table/Generic.vue` (lines 68-74)
**Apply to:** Pagination controls that read `UTable`'s internal TanStack state
```vue
<UPagination
  :page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
  :items-per-page="table?.tableApi?.getState().pagination.pageSize"
  :total="table?.tableApi?.getFilteredRowModel().rows.length"
  @update:page="(p) => table?.tableApi?.setPageIndex(p - 1)"
/>
```

## No Analog Found

Files with no close match in the codebase (planner should use the phase decisions and existing file content directly):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/ui/app/components/HeroShadersDynamic.vue` | component | request-response | Only `defineAsyncComponent` wrapper in the layer; no sibling file dynamically imports a `.client.vue` component. |
| `packages/ui/app/components/HeroShaders.client.vue` | component | request-response | Only `.client.vue` shader component; no other shader component exists to pattern from. |

## Metadata

**Analog search scope:** `packages/ui/app/components/**/*.vue`, `packages/ui/app/pages/**/*.vue`, `docs/content/**/*.md`
**Files scanned:** 4 source files + 3 analog files (`meili/index/DataTable.vue`, `table/Generic.vue`, `BadgeGroup.vue`)
**Pattern extraction date:** 2026-08-05
