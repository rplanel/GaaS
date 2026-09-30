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

- **Access level.** The level follows from what the endpoint exposes. `@gaas/ui` pages are not route-gated — the server refuses and the nav hides the link — so a page left reading an endpoint it may no longer call draws an empty list and reports nothing. Every page that reaches an `admin` endpoint, whether directly, through a query, a composable, or a component it renders, declares `definePageMeta({ middleware: 'admin' })`. Where the level lives depends on the prefix:
  - `/api/galaxy/*`: its entry in `GALAXY_ROUTE_ACCESS`, which `galaxyGuard` enforces.
  - `/api/db/*`: no table and no guard. Each handler requires a session itself, row-level security and RBAC policies decide the rest, and a handler that is admin-only calls `requireRole(user, 'admin')`, as `api/db/analyses/monitoring/admin.get.ts` does. See "What does not do this job" in `docs/content/3.packages/2.nuxt-galaxy/3.server.md`.
- **Response shape.** Every consumer reading the old shape changes in the same merge request. A query that unwraps an `{ data, error }` envelope is one of them.
- **Path, or deletion.** The `addServerHandler` call in `module.ts` and, under `/api/galaxy`, the `GALAXY_ROUTE_ACCESS` key change with it; both are in the step 1 list.

## 3. Run what enforces it, and cover what it cannot see

```bash
pnpm --filter nuxt-galaxy exec vitest run test/module/routes.test.ts  # registered routes ⇄ GALAXY_ROUTE_ACCESS, both directions
pnpm --filter @gaas/ui exec vitest run test/pageAccess.test.ts         # an admin endpoint ⇒ the admin guard, per page
```

Both are **blind** outside what they scan. `routes.test.ts` counts `/api/galaxy` routes only. `pageAccess.test.ts` follows a path written as one string or template, a query, and a rendered component; it does not follow a composable (#127), a path assembled at runtime, or anything under `/api/db`. Green says nothing about those.

**Done when** every page in the step 1 list that reaches the endpoint through one of those blind spots has had its `definePageMeta` read by hand, and the result is in your answer.

Run `pnpm dev:prepare` at the repo root before trusting a `ui` or `wiki` typecheck: a new named middleware or auto-import stays untyped until it does, and `wiki` checks `ui`'s pages against its own `.nuxt`.
