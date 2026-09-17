<!-- refreshed: 2026-08-10 -->
# Architecture

**Analysis Date:** 2026-08-10

## System Overview

GaaS (Galaxy as a Service) is a pnpm monorepo delivering a toolkit for building web applications integrated with the Galaxy bioinformatics platform and Supabase (Postgres) storage. The runtime architecture is a Nuxt-based stack organized as composable **layers**, with a TypeScript Effect-TS client library at the base. Components are wired together through Nuxt module registration, layer `extends`, and file-system routing.

```text
┌───────────────────────────────────────────────────────────────────┐
│                     Presentation Layers                            │
├────────────────────────┬──────────────────┬────────────────────────┤
│   docs (Nuxt site)     │  playground      │  wiki pages           │
│  `docs/`               │  `playground/`   │  `packages/wiki/app/` │
└──────────────┬─────────┴────────┬─────────┴───────────┬────────────┘
               │   extends        │  extends            │  extends
               ▼                  ▼                     ▼
┌───────────────────────────────────────────────────────────────────┐
│                    @gaas/ui — Nuxt Layer                           │
│  `packages/ui/app/`  (components, composables, pages, layouts)    │
│  modules: @nuxt/ui, @pinia/nuxt, @pinia/colada-nuxt, nuxt-galaxy  │
└───────────────────────────────────────────────────────────────────┘
               │  includes module 'nuxt-galaxy'
               ▼
┌───────────────────────────────────────────────────────────────────┐
│              nuxt-galaxy — Nuxt Module                             │
│  `packages/nuxt-galaxy/src/module.ts`  (registration)              │
│  ├─ runtime/app/   client composables, pinia-colada queries        │
│  └─ runtime/server/  API handlers, Drizzle schema + migrations,   │
│                      Effect grizzle service layer, nitro tasks     │
└───────────────────────────────────────────────────────────────────┘
               │  imports
               ▼
┌───────────────────────────────────────────────────────────────────┐
│      blendtype — Pure TS library (Effect-TS Galaxy client)        │
│      `packages/blendtype/src/`                                     │
└───────────────────────────────────────────────────────────────────┘
               │
               ▼
   Galaxy REST API + Supabase (Postgres) + Meilisearch
```

`pnpm-workspace.yaml` (lines 18-24) declares the actual packages: `packages/blendtype`, `packages/nuxt-galaxy`, `packages/ui`, `packages/wiki`, `docs`, `playground`. There is **no `packages/llm`** in the workspace (widely documented but not present in this tree or the package list).

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| blendtype | Pure TypeScript Effect-TS client for the Galaxy REST API; typed models & dual-export operations (Effect + Promise) | `packages/blendtype/src/index.ts`, `src/galaxy.ts`, `src/histories.ts`, `src/types/` |
| nuxt-galaxy | Nuxt module wiring Galaxy + Supabase into an app: auto-imports composables/queries, registers server API handlers & plugins, Drizzle schema/migrations, scheduled sync task | `packages/nuxt-galaxy/src/module.ts` |
| @gaas/ui | Nuxt UI layer: Galaxy-specific components, pages, layouts, meili/mosaic/plot dataviz; assumes nuxt-galaxy module configured | `packages/ui/nuxt.config.ts`, `packages/ui/app/components/`, `app/pages/` |
| @gaas/wiki | Nuxt content/wiki layer extending @gaas/ui; markdown content, bibliography/citation components, article & datatable layouts | `packages/wiki/nuxt.config.ts`, `packages/wiki/app/pages/wiki/` |
| docs | Standalone documentation site (Nuxt content) | `docs/` |
| playground | Test/dev application extending @gaas/wiki | `playground/nuxt.config.ts` |
| gaas-cli | Python CLI (Typer/Rich) for bibliography, Meilisearch indexing, content conversion | `packages/gaas-cli/src/gaas_cli/main.py` |

## Pattern Overview

**Overall:** Layered micro-frontend (Nuxt layers + module) over a functional Effect-TS core, with dependency injection at every boundary.

**Key Characteristics:**
- **Dependency direction** is enforced: wiki → ui → nuxt-galaxy → blendtype. Upstream (foundation) never depends on downstream (layers). `@gaas/wiki` imports only `@gaas/ui` (never nuxt-galaxy directly).
- **Effect-TS as the composition backbone**: nearly every backend operation and the Galaxy client is an `Effect` program built with `Effect.gen`, services provided via `Context.Tag` + `Layer`, and errors modeled with `Data.TaggedError`.
- **Dual-export API convention in blendtype**: each operation ships as `*Effect()` (composable, returns `Effect`) and `*()` (Promise wrapper that takes a `Layer` and `Effect.runPromise`).
- **Nuxt module as the runtime wiring point**: `module.ts` programmatically registers composables (via `addImports`), imports dirs (`addImportsDir`, `addServerImportsDir`), API handlers (`addServerHandler`), server plugins (`addServerPlugin`), and Nitro tasks.
- **File-system routing** for both client pages and server API endpoints.
- **Supabase for state, Galaxy for compute**: analyses/workflows/datasets metadata lives in Postgres (via Drizzle/Supabase), while heavy lifting (run workflows, fetch tools) delegates to Galaxy through blendtype.

## Layers

**blendtype (foundation):**
- Purpose: Type-safe Effect-TS client for Galaxy REST API, with no Nuxt/Node runtime coupling.
- Location: `packages/blendtype/src/`
- Contains: service definitions (`galaxy.ts` `GalaxyFetch`, `config.ts` `BlendTypeConfig`), per-resource operations (`histories.ts`, `workflows.ts`, `datasets.ts`, `jobs.ts`, `tools.ts`, `invocations.ts`), error tags (`errors.ts`), Zod/typed models (`types/`).
- Depends on: `effect`, `ofetch`, `tus-js-client`, `ufo`, `zod`, `dotenv`.
- Used by: nuxt-galaxy server code (`import * as bt from 'blendtype'`).

**nuxt-galaxy runtime (module):**
- Purpose: Wires Galaxy + Supabase into any Nuxt app and exposes client composables, typed SQL queries, and a complete server-side API/DB layer.
- Location: `packages/nuxt-galaxy/src/runtime/`
- Contains: `app/composables/`, `app/queries/`, `app/utils/` (client); `server/api/`, `server/utils/grizzle/`, `server/db/`, `server/plugins/`, `server/tasks/`, `server/lib/` (server).
- Depends on: `blendtype`, `drizzle-orm`, `effect`, `evlog`, `@nuxtjs/supabase`, `@nuxt/content` (moduleDependencies).
- Used by: `@gaas/ui` (includes `nuxt-galaxy` module).

**ui (presentation layer):**
- Purpose: Reusable Galaxy-facing UI components, layouts, and pages plus dataviz (meili facet tables, Mosaic/plot, sequence browser).
- Location: `packages/ui/app/`
- Contains: `components/` (`galaxy/`, `meili/`, `mosaic`/`plot/`, `workflow/`, `analysis/`), `pages/` (admin, analyses, datasets, galaxy, workflows), `layouts/` (`default`, `landing`, `auth`), `composables/`, `schemas/`, `types/`, `utils/`.
- Depends on: `nuxt-galaxy`, `@nuxt/ui`, `@pinia/colada`, `@pinia/nuxt`, `@uwdata/*`, `meilisearch`, `effect`, `zod`.
- Used by: `@gaas/wiki` (via `extends`).

**wiki (content layer):**
- Purpose: Markdown-driven documentation/wiki with bibliography & citation support.
- Location: `packages/wiki/app/`
- Contains: `components/content/` (`BibliographySection.vue`, `Ref.vue`), `layouts/wiki/`, `pages/wiki/[...slug].vue`, `schemas/wiki.ts`, `composables/` (`useBibliography`, `useCitations`), `utils/content/search.ts`.
- Depends on: `@gaas/ui`, `@nuxt/content`, `better-sqlite3`.
- Used by: `playground/` and `docs/` (via `extends`).

## Data Flow

### Primary Request Path — run an analysis

1. Client calls a composable (e.g. `useGalaxyWorkflow`/parameter encode in `packages/ui/app/composables/galaxy/useGalaxyEncodeParameters.ts`), which POSTs to a server endpoint.
2. Server handler `packages/nuxt-galaxy/src/runtime/server/api/db/analyses.post.ts` — `defineEventHandler` reads the body, builds an `Effect.gen` program:
   - resolves user via `getSupabaseUser(event)` (`server/utils/grizzle/supabase.ts`),
   - checks Galaxy health (`server/utils/health.ts`),
   - creates a history row (`server/utils/grizzle/histories.ts`),
   - uploads datasets (`server/utils/grizzle/datasets.ts`),
   - runs `runAnalysis` (`server/utils/grizzle/analyses.ts`), which calls `bt.invokeWorkflowEffect`/`bt.getInvocationEffect` (blendtype → Galaxy REST) and inserts an `analyses` row + `analysisMonitoring` row in a Drizzle transaction.
3. The program is provided a composed final layer (`Drizzle.Live`, `ServerSupabaseClient.Live`, `ServerSupabaseClaims.Live`, `UrlFetch.Live`, plus `useGalaxyLayer()`) and executed via `runGalaxyEffect(event, program)` (`server/utils/evlog-effect.ts`), which swaps in the evlog `Logger` and runs with `Effect.runPromise`.

### Client data flow — list analyses

1. Pages/components call pinia-colada `useQuery` with a query defined in `packages/nuxt-galaxy/src/runtime/app/queries/supabase/analyses.ts` (`defineQueryOptions` + typed `SUPABASE_ANALYSES_QUERY_KEYS`).
2. Query runs a Supabase `.schema('galaxy').from('analyses').select(...)` against `useSupabaseClient<Database>()`, normalized via `supabaseResponseToData` (`app/queries/utils.ts`).
3. Results cache in the pinia-colada store (client-side).

### Galaxy client request path (blendtype)

1. Caller obtains a layer via `makeGalaxyLayer({ apiKey, url })` (`src/galaxy.ts`) which builds `BlendTypeConfig` and `GalaxyFetch` (a configured `$fetch.create` with `x-api-key` header + baseURL).
2. An operation like `getWorkflowEffect` (`src/workflows.ts`) does `Effect.gen(function* () { const fetchApi = yield* GalaxyFetch ... })`, retried via `withRetry` (exponential backoff on 429/503).
3. Promise wrapper `getWorkflow(id, layer)` pipes `toGalaxyServiceUnavailable` then `Effect.runPromise`.

### Scheduled sync flow

- Nitro task `galaxy:sync-analyses` (registered in `module.ts` via `nuxt.options.nitro.tasks`, scheduled every 30s *in dev config*) → `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts`, executed with `runTaskEffect` (`server/utils/evlog-effect.ts`).

**State Management:**
- **Server/DB state:** Postgres via Drizzle ORM, schema under `packages/nuxt-galaxy/src/runtime/server/db/schema/` (galaxy, galaxyRbac, auth, storage) with drizzle-kit migrations in `db/migrations/`.
- **Client query state:** Pinia Colada (`@pinia/colada-nuxt`) with typed query keys in `app/queries/`.
- **Auth/session:** `@nuxtjs/supabase` SSR session; server resolves subject identity via `ServerSupabaseClaims`/`getSupabaseUser`.
- **Application config:** Nuxt runtimeConfig (public `galaxy` for URL/blob-mode, private `galaxy` for apiKey/drizzle/sync/logs), declared in `module.ts` and consumed via `#imports` (`useRuntimeConfig`).

## Key Abstractions

**Effect Service + Static Live Layer:**
- Purpose: Encapsulate a typed dependency (HTTP client, DB connection, Supabase client) as an injectable service.
- Examples: `GalaxyFetch` (`src/galaxy.ts`), `BlendTypeConfig` (`src/config.ts`), `Drizzle` (`server/utils/drizzle.ts`), `ServerSupabaseClient`/`ServerSupabaseClaims`/`UrlFetch` (`server/utils/grizzle/supabase.ts`, `server/utils/fetch.ts`).
- Pattern: `class X extends Context.Tag('@scope/X')<X, Impl>() {}` plus `static readonly Live = Layer.succeed(...)`, composed with `Layer.merge`/`Layer.mergeAll`.

**Dual-export Operation (blendtype):**
- Purpose: Offer both Effect-composition and imperative Promise call styles.
- Examples: `createHistoryEffect`/`createHistory`, `getWorkflowEffect`/`getWorkflow` in `src/histories.ts`, `src/workflows.ts`.
- Pattern: `*Effect()` returns `Effect.gen`; `*()` wraps it with `toGalaxyServiceUnavailable`, `Effect.provide(layer)`, `Effect.runPromise`.

**Tagged Errors:**
- Purpose: Typed, data-carrying failure model across the stack.
- Examples: `HistoryError`, `Data.TaggedError('...')` in `src/errors.ts` and per-file (`TusUploadError` in `src/histories.ts`; `DeleteAnalysisError`/`InsertAnalysisError`/`GetAnalysisError` in `server/utils/grizzle/analyses.ts`).
- Pattern: `class X extends Data.TaggedError('X')<{ readonly message: string; readonly cause?: unknown }> {}`.

**Nuxt Module (runtime aggregator):**
- Purpose: Single registration point that wires auto-imports, server handlers, plugins, and tasks via `@nuxt/kit`.
- Example: `packages/nuxt-galaxy/src/module.ts` (`defineNuxtModule<ModuleOptions>` with `meta`, `moduleDependencies`, `defaults`, `setup`).

**grizzle Effect DB services:**
- Purpose: Server-side repository functions returning `Effect`s that call Drizzle within the effect system.
- Examples: `runAnalysis`, `insertAnalysis`, `getAnalysis`, `upsertX` under `server/utils/grizzle/`.
- Pattern: `Effect.gen(function* () { const useDrizzle = yield* Drizzle; return yield* Effect.tryPromise({ try: () => useDrizzle.select()... , catch }) })`.

## Entry Points

**blendtype library:**
- Location: `packages/blendtype/src/index.ts`
- Triggers: package imports (re-export of all public modules).
- Responsibilities: Barrels `config`, `galaxy`, `errors`, all resource modules, and `types`.

**nuxt-galaxy module:**
- Location: `packages/nuxt-galaxy/src/module.ts`
- Triggers: Nuxt build when `nuxt-galaxy` is in `modules[]` / a layer includes it.
- Responsibilities: Option defaults, moduleDependencies (`@nuxtjs/supabase`, `@nuxt/content`), evlog module install, runtimeConfig setup, composable + query auto-imports, server handler registration, server plugins (`galaxy.server`, `evlog.server`, optional `migrations.server`), Nitro task registration.

**Server API handlers:**
- Location: `packages/nuxt-galaxy/src/runtime/server/api/` (`/api/galaxy/*`, `/api/db/*`, `/api/probe`)
- Triggers: HTTP requests to registered routes.
- Responsibilities: Auth (`getSupabaseUser`), validation, orchestrate grizzle/blendtype effects, run via `runGalaxyEffect`.

**Nitro scheduled task:**
- Location: `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses.ts`
- Triggers: Nitro `scheduledTasks` (registered in `module.ts`).
- Responsibilities: Reconcile Galaxy analysis state into Supabase; uses `runTaskEffect`.

**Server plugins:**
- Location: `packages/nuxt-galaxy/src/runtime/server/plugins/` (`galaxy.server.ts`, `evlog.server.ts`, `migrations.server.ts`)
- Responsibilities: Galaxy layer init, evlog drain setup, optional startup migrations.

**Application/layer configs:**
- `packages/ui/nuxt.config.ts`, `packages/wiki/nuxt.config.ts`, `playground/nuxt.config.ts`, `docs/nuxt.config.ts` — each defines `modules`, `extends`, runtimeConfig, css.

**Python CLI:**
- Location: `packages/gaas-cli/src/gaas_cli/main.py` (`gaas` Typer app with `biblio`, `content/collection`, `meili` subcommand groups).

## Architectural Constraints

- **Dependency direction:** Downstream layers import upstream only. `@gaas/wiki` must not import nuxt-galaxy directly; use `@gaas/ui` abstractions. Enforced by AGENTS.md and package `dependencies`.
- **blendtype purity:** `packages/blendtype` must contain no Nuxt/Node-framework code (isomorphic client).
- **Effect-based server services:** DB mutations and Galaxy calls are written as `Effect` programs, never raw `await` inside handlers; results are executed via `runGalaxyEffect`/`runTaskEffect`.
- **Threading/event model:** Node server under Nitro/Nuxt; single-threaded event loop. `useGalaxyLayer()` (`server/utils/galaxy.ts`) builds a module-level lazy singleton `_galaxyLayer` reused across requests (shared mutable module state).
- **Global state:** `_galaxyLayer` singleton in `server/utils/galaxy.ts`; evlog `AsyncLocalStorage` request-scoped logger in `server/utils/evlog-effect.ts`; the `postgres` client singleton + `Drizzle.Live` in `server/utils/drizzle.ts`.
- **Config via runtimeConfig:** Environment secrets (`GALAXY_API_KEY`, `GALAXY_EMAIL`, `GALAXY_DRIZZLE_DATABASE_URL`) flow into module `defaults` then runtimeConfig; never referenced directly in client code.
- **Workspace catalogs:** dependencies pinned through `catalog:`, `catalog:nuxt`, `catalog:dataviz`, `catalog:testing`, `catalog:vue` in `pnpm-workspace.yaml`; cross-package imports via `workspace:*`.

## Anti-Patterns

### Drizzle `$inferInsert` workaround type
**What happens:** `NewAnalysis` is manually re-declared with `Omit<typeof analyses.$inferInsert, 'id'|'createdAt'|'parameters'|'invocation'>` because of a Drizzle bug (`packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts`, marked `@deprecated`).
**Why it's wrong:** Duplicates schema shape and can drift when the Drizzle schema changes.
**Do this instead:** Remove the override and use `typeof analyses.$inferInsert` once Drizzle is fixed (comment documents the intended target).

### Dead / legacy client init API
**What happens:** `initializeGalaxyClient()` / `runWithConfig()` global-config approach referenced in `PACKAGES.md`/AGENTS examples.
**Why it's wrong:** The codebase moved to `makeGalaxyLayer()` + `useGalaxyLayer()`; `src/config.ts` still exposes `makeConfigLayer`/`BlendTypeConfig` (used) but the old global-initializer pattern is obsolete.
**Do this instead:** Always build a layer explicitly and `Effect.provide` it (see `src/galaxy.ts` `makeGalaxyLayer`, `server/utils/galaxy.ts` `useGalaxyLayer`).

## Error Handling

**Strategy:** Typed unify-failure via `Data.TaggedError`, mapped and provided through the Effect system, then surfaced as HTTP errors.

**Patterns:**
- Resource operations wrap `Effect.tryPromise` with a per-resource tagged error carrying `message`, `statusCode`, `cause` (`src/errors.ts` `extractStatusCode`/`formatErrorMessage`).
- `toGalaxyServiceUnavailable` converts 503/service-unavailable into `GalaxyServiceUnavailable` (`src/galaxy.ts`).
- Idempotent gets are retried with `withRetry` (exponential backoff, 429/503) (`src/galaxy.ts`).
- DB queries use `Effect.tryPromise` with `catch` mapping to a local tagged error in each grizzle module (`server/utils/grizzle/*.ts`).
- h3 `createError` for middleware-level uniqueness failures (`server/utils/grizzle/helper.ts` `takeUniqueOrThrow`).

## Cross-Cutting Concerns

**Logging:** evlog is the structured logger. Server handlers use `useLogger(event)`; Effect programs are routed to evlog by `runGalaxyEffect`/`runTaskEffect` (via `Logger.replace(Logger.defaultLogger, evlogEffectLogger)` in `server/utils/evlog-effect.ts`). Client components/composables use `evlog/client`'s `log`. See `.planning/LOGGING-SPEC.md`.
**Validation:** Zod schemas for client-facing inputs (`ui/app/schemas/`, `wiki/app/schemas/wiki.ts`, `nuxt-galaxy/src/runtime/types/`); Zotero/DOI parsing in wiki composables.
**Authentication:** `@nuxtjs/supabase` SSR auth; server resolves identity with `getSupabaseUser`/`ServerSupabaseClaims` (`server/utils/grizzle/supabase.ts`) and enforces owner-scoped queries (`where(and(eq(analyses.id, id), eq(analyses.ownerId, ownerId)))`).
**Configuration:** Nuxt runtimeConfig (public vs private) in `module.ts`; `.env` for local secrets.

---

*Architecture analysis: 2026-08-10*
