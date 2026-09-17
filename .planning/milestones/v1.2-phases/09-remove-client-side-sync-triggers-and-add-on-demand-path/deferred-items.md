# Deferred Items — Phase 09

## Pre-existing docs typecheck failure

- **Discovered during:** Task 3 verification (`pnpm --filter ./docs typecheck`)
- **Files affected:** `docs/app/pages/[...slug].vue`, `node_modules/@nuxt/image/dist/runtime/components/NuxtPicture.vue`
- **Issue:** TypeScript errors unrelated to `docs/content/2.concepts/2.sync-contract.md` changes cause the docs package `typecheck` script to exit non-zero.
- **Why deferred:** The failure is pre-existing (verified by stashing the sync-contract changes and re-running `pnpm --filter ./docs typecheck`, which still fails). Fixing docs app/Nuxt Image type errors is out of scope for the Phase 09 sync-contract documentation task and should be handled in Phase 11 (Verify Quality Gates) or a dedicated docs cleanup plan.
