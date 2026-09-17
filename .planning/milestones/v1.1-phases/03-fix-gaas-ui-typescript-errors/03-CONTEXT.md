# Phase 3: Fix `@gaas/ui` TypeScript Errors - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve the 4 pre-existing TypeScript errors in `@gaas/ui` so that `pnpm --filter @gaas/ui typecheck` and root `pnpm typecheck` pass, without changing UI runtime behavior for the HeroShaders background, the plot Table, or the index page copy button.

This phase only touches type-level fixes in the four identified files; it does not add features, refactor architecture, or change logging conventions.

</domain>

<decisions>
## Implementation Decisions

### HeroShaders dynamic import
- **D-01:** `HeroShadersDynamic.vue` resolves its dynamic import with a relative path: `import('./HeroShaders.client.vue')`. This lets `vue-tsc` resolve the real file while preserving Nuxt's `.client.vue` client-only semantics. Reversibility: reversible — a one-line import change.

### plot/Table.vue columnVisibility model
- **D-02:** `columnVisibility` uses the generic `defineModel` form: `defineModel<Record<string, boolean>>('columnVisibility', { default: () => ({}) })`. This satisfies the Vue 3.5+ `defineModel` API and keeps the two-way binding already used by `<UTable v-model:column-visibility="columnVisibility" />`. Reversibility: reversible — local prop/emit refactor would undo it.

### plot/Table.vue tableApi access
- **D-03:** The `tableElem` template ref is typed as `useTemplateRef<{ tableApi: Table<T> }>('tableElem')`, and the existing `tableElem?.tableApi?.getState()` / `getFilteredRowModel()` / `setPageIndex()` calls are preserved. Reversibility: reversible — changes only type annotations.

### pages/index.vue copy() fallback
- **D-04:** The copy button is only rendered when `page.cta.command` is defined. When it is undefined, the button is hidden rather than copying an empty string or disabling a visible button. Reversibility: reversible — template guard only.

### the agent's Discretion
- How each TypeScript error is mechanically expressed (exact syntax, whether to add an intermediate type alias, import style) is left to the implementer, provided the decisions above are respected and `pnpm --filter @gaas/ui typecheck` passes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/REQUIREMENTS.md` — TYPE-01, TYPE-02, TYPE-03, TYPE-04 define the four errors to fix.
- `.planning/WINDOWS.md` — Broken window #1 records the 4 pre-existing `@gaas/ui` TypeScript errors.
- `.planning/PROJECT.md` — Milestone v1.1 "Restore Quality Gates" context and constraints.

### Conventions
- `.planning/AGENTS.md` — Monorepo conventions, quality gates, and layer boundaries.
- `packages/ui/AGENTS.md` — `@gaas/ui` layer conventions, component patterns, and test commands.

### Source files under repair
- `packages/ui/app/components/HeroShadersDynamic.vue`
- `packages/ui/app/components/HeroShaders.client.vue`
- `packages/ui/app/components/plot/Table.vue`
- `packages/ui/app/pages/index.vue`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@nuxt/ui` `<UTable>` is used with `v-model:pagination` and `v-model:column-visibility`; it exposes a `tableApi` instance for pagination introspection.
- `@vueuse/core` `useClipboard()` provides `copy()` and `copied` for the index page CTA.

### Established Patterns
- Vue SFCs use `<script setup lang="ts">`; generic components use `<script lang="ts" setup generic="T">`.
- Props are declared with an interface named `Props` and `defineProps<Props>()`.
- Type-only imports come first, followed by value imports, then relative internal imports.

### Integration Points
- Fixes are local to `packages/ui/app/`; no changes cross package boundaries.
- Root `pnpm typecheck` consumes the package-level result, so the success criterion is package-level `@gaas/ui typecheck` passing.

</code_context>

<specifics>
## Specific Ideas

- No specific visual or behavioral redesign requested. The goal is a green typecheck gate while preserving current runtime behavior.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-Fix `@gaas/ui` TypeScript Errors*
*Context gathered: 2026-08-05*
