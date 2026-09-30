---
name: endpoint-blast-radius
description: Blast radius of a GaaS server endpoint change. Use before changing who may call an `/api/**` endpoint, the shape it answers, or its path — deleting it included — and when reviewing such a change.
---

# Endpoint blast radius

An endpoint's consumers are **string references**, not call edges: a page reaches `/api/galaxy/workflows` by spelling the URL, so no call graph links it to the handler. The path string is the index. `git grep` it — this is the literal-text case CLAUDE.md reserves grep for.

## 1. Enumerate every consumer

Grep the path with each `:param` widened to one segment. `--untracked` reaches files not yet committed; ignored build output is skipped on its own:

```bash
git grep --untracked -nE "api/galaxy/workflows/[^/'\"\`]*/versions"
```

When the path is a prefix of others, anchor its end with a quote — `"api/galaxy/workflows['\"\`]"` — or every child route matches too.

Every hit depends on the path. Most are **consumers**. A **wrapper** is a hit that has consumers of its own: a Colada query, a composable, or a component that calls the endpoint for others. For each wrapper, grep its exported name, and for a component its tag (`PublishVersionModal` renders as `<AdminPublishVersionModal>`, so grep the basename). Treat those hits the same way.

**Done when** a round finds no new wrapper. That list is the blast radius. Any other consumer list — a query's usages, `codegraph_callers`, what you remember of the codebase — is checked against it; where they differ, the grep is right.

## 2. Decide every consumer

**Done when** every hit is either *changed* or *unaffected, with the reason*.

- **Access level.** The level follows from what the endpoint exposes. `@gaas/ui` pages are not route-gated — the server refuses and the nav hides the link — so a page left reading an endpoint it may no longer call draws an empty list and reports nothing. Every page that reaches an `admin` endpoint, whether directly, through a query, or through a component it renders, declares `definePageMeta({ middleware: 'admin' })`.
- **Response shape.** Every consumer reading the old shape changes in the same merge request. A query that unwraps an `{ data, error }` envelope is one of them.
- **Path, or deletion.** The `addServerHandler` call in `module.ts`, the entry in `GALAXY_ROUTE_ACCESS`, and every docs, `PACKAGES.md` and `AGENTS.md` line that spells the path are already in the step 1 list.

## 3. Run what enforces it

```bash
pnpm --filter nuxt-galaxy exec vitest run test/module/routes.test.ts  # registered routes ⇄ GALAXY_ROUTE_ACCESS, both directions
pnpm --filter @gaas/ui exec vitest run test/pageAccess.test.ts         # an admin endpoint ⇒ the admin guard, per page
```

Run `pnpm dev:prepare` at the repo root before trusting a `ui` or `wiki` typecheck: a new named middleware or auto-import stays untyped until it does, and `wiki` checks `ui`'s pages against its own `.nuxt`.

## Why the query index misleads

#99 made `GET /api/galaxy/workflows` admin-only after tracing its consumers through `galaxyWorkflowsListQuery`, which found only the admin page. `/galaxy/workflows` called `useFetch` on the path itself, so it appeared in no query's usages: the level went up, the page went blank, and every test and review stayed green. The path grep lists it on the first round.
