# Phase 3: Fix `@gaas/ui` TypeScript Errors - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `03-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-08-05
**Phase:** 3-Fix `@gaas/ui` TypeScript Errors
**Areas discussed:** HeroShaders import path, columnVisibility model typing, tableApi ref access, copy() undefined command

---

## HeroShaders import path

| Option | Description | Selected |
|--------|-------------|----------|
| Relative path to `.client.vue` | `import('./HeroShaders.client.vue')` — TypeScript resolves the real file; keeps `.client.vue` semantics. | ✓ |
| Alias path without `.client` | `import('~/components/HeroShaders.vue')` — relies on Nuxt convention. | |
| Keep alias + add shim | Keep `~/components/HeroShaders.client.vue` and add a type declaration. | |

**User's choice:** Relative path to `.client.vue`
**Notes:** User asked for elaboration on the three possibilities. After trade-off explanation, they chose the simplest, most type-safe option.

---

## columnVisibility model typing

| Option | Description | Selected |
|--------|-------------|----------|
| Generic `defineModel` | `defineModel<Record<string, boolean>>('columnVisibility', { default: () => ({}) })` — modern Vue 3.5+ syntax. | ✓ |
| Props + emits fallback | Replace `defineModel` with props/emits for broader compatibility. | |
| Type-only cast | Keep current shape but adjust the assertion. | |

**User's choice:** Generic `defineModel`
**Notes:** Direct selection.

---

## tableApi ref access

| Option | Description | Selected |
|--------|-------------|----------|
| Type the template ref | `useTemplateRef<{ tableApi: Table<T> }>('tableElem')` and keep current `tableApi` access. | ✓ |
| Derive state from props | Avoid reaching into the component ref; compute pagination from local state. | |
| Use a watcher | Capture `tableApi` into a local ref after mount. | |

**User's choice:** Type the template ref
**Notes:** User asked for a recommendation between options 1 and 2. Recommended option 1 as the least invasive TypeScript-only fix that preserves runtime behavior.

---

## copy() undefined command

| Option | Description | Selected |
|--------|-------------|----------|
| Hide the button | Only render the copy button when `page.cta.command` exists. | ✓ |
| Disable the button | Render but disable when `page.cta.command` is missing. | |
| Copy empty string | Call `copy(page.cta.command || '')` and keep the button visible. | |

**User's choice:** Hide the button
**Notes:** Direct selection.

---

## the agent's Discretion

- Exact TypeScript syntax and any minor type-alias choices are left to the implementer, provided the four decisions above are respected and `pnpm --filter @gaas/ui typecheck` passes.

## Deferred Ideas

None.
