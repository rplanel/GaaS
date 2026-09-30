---
name: endpoint-blast-radius
description: Blast radius of a GaaS server endpoint change. Use before changing who may call an `/api/galaxy/**` or `/api/db/**` endpoint, the shape it answers, or its path — deleting it included — and when reviewing such a change.
---

# Endpoint blast radius

An endpoint's consumers are **string references**, not call edges: a page reaches `/api/galaxy/workflows` by spelling the URL, so no call graph links it to the handler, and no query's usages list it either. #99 traced `GET /api/galaxy/workflows` through `galaxyWorkflowsListQuery`, found only the admin page, and raised the level; `/galaxy/workflows` called `useFetch` on the path itself and went blank with every test and review green. The path string is the index. `git grep` it — this is the literal-text case CLAUDE.md reserves grep for.

## 1. Enumerate every consumer

Grep the path with each `:param` widened to one segment. `--untracked` reaches files not yet committed; ignored build output is skipped on its own:

```bash
git grep --untracked -nE "api/galaxy/workflows/[^/'\"\`]*/versions"
```

When the path is a prefix of others, anchor its end with a quote — `"api/galaxy/workflows['\"\`]"` — or every child route matches too.

Every hit depends on the path. Most are **consumers**. A **wrapper** is a hit that has consumers of its own: a Colada query, a composable, or a component that calls the endpoint for others. For each wrapper, grep its exported name — composables are auto-imported, so the bare name is the only trace — and for a component its tag (`PublishVersionModal` renders as `<AdminPublishVersionModal>`, so grep the basename). Treat those hits the same way.

**Done when** a round finds no new wrapper. That list is the blast radius. Any other consumer list — a query's usages, `codegraph_callers`, what you remember of the codebase — is checked against it; where they differ, the grep is right.

## 2. Decide every consumer

**Done when** every hit is either *changed* or *unaffected, with the reason*. Historical records — ADRs, dated plans under `docs/superpowers/plans/` — are unaffected by definition.

- **Access level.** The level follows from what the endpoint exposes. `@gaas/ui` pages are not route-gated — the server refuses and the nav hides the link — so a page left reading an endpoint it may no longer call draws an empty list and reports nothing. Every page that reaches an `admin` endpoint, whether directly, through a query, a composable, or a component it renders, is gated, and which gate depends on who else uses the page:
  - **Only admins use it:** `definePageMeta({ middleware: 'admin' })`.
  - **Non-admins use the rest of it** (the profile hub, an analysis page): gate the part that reads the endpoint, not the page — `useUserRole`, `enabled: isAdmin` on the query, and a `v-if` on the section or button, as `pages/admin/usage.vue` does with `AdminPermissionAlert`. Hide the nav links that lead to it the same way. Under `/api/galaxy`, check this form against what `pageAccess.test.ts` accepts (step 3).

  Where the level lives depends on the prefix:
  - `/api/galaxy/*`: its entry in `GALAXY_ROUTE_ACCESS` (`galaxyAccess.ts`).
  - `/api/db/*`: the handler itself; "What does not do this job" in `docs/content/3.packages/2.nuxt-galaxy/3.server.md` says how. `api/db/analyses/monitoring/admin.get.ts` is an admin-only one.
- **Response shape.** Every consumer reading the old shape changes in the same merge request. A query that unwraps an `{ data, error }` envelope is one of them.
- **Path, or deletion.** The `addServerHandler` call in `module.ts` and, under `/api/galaxy`, the `GALAXY_ROUTE_ACCESS` key change with it; both are in the step 1 list.

## 3. Run what enforces it, and cover what it cannot see

```bash
pnpm --filter nuxt-galaxy exec vitest run test/module/routes.test.ts  # registered routes ⇄ GALAXY_ROUTE_ACCESS, both directions
pnpm --filter @gaas/ui exec vitest run test/pageAccess.test.ts         # an admin endpoint ⇒ the admin guard, per page
```

Both are **blind** outside what they scan, and each says where in its own header comment — `routes.test.ts` at the top, `pageAccess.test.ts` under "What it does **not** see", along with what it does not accept and what to build before running it. Read both headers before trusting green: they are kept with the code they describe, so they are current where a copy here would not be.

**Done when** every page in the step 1 list that reaches the endpoint through something those headers list has had its gate read by hand — `definePageMeta`, or the in-page gate — and the result is in your answer.

Run `pnpm dev:prepare` at the repo root before trusting a `ui` or `wiki` typecheck: a new named middleware or auto-import stays untyped until it does, and `wiki` checks `ui`'s pages against its own `.nuxt`.
