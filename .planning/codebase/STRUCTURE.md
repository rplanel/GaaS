# Codebase Structure

**Analysis Date:** 2026-08-10

## Directory Layout

```
gaas/
├── pnpm-workspace.yaml    # Workspace package list + dependency catalogs
├── package.json           # Root scripts (dev/build/test/lint/release/supabase)
├── AGENTS.md              # Monorepo conventions & layer rules
├── PACKAGES.md            # Package-by-package docs
├── docs/                  # @gaas/docs — standalone documentation Nuxt site
├── playground/            # Test/dev Nuxt app (extends @gaas/wiki)
├── packages/
│   ├── blendtype/         # Pure TS Effect-TS Galaxy REST client
│   ├── nuxt-galaxy/       # Nuxt module (Galaxy + Supabase integration)
│   ├── ui/                # @gaas/ui — Nuxt UI layer (components/pages)
│   ├── wiki/              # @gaas/wiki — Nuxt content/wiki layer
│   └── gaas-cli/          # Python CLI (Typer/Rich)
├── scripts/               # Root-level helper scripts (lint-staged, sync-versions)
├── repos/                 # Vendored external repos (read-only reference)
├── .planning/             # GSD planning artifacts (incl. codebase/, LOGGING-SPEC.md)
├── .github/workflows/     # ci.yml
└── .evlog/logs/           # Structured log output
```

## Directory Purposes

**`packages/blendtype/` — pure TS library (base of the stack):**
- Purpose: Galaxy REST client on Effect-TS; zero Nuxt/Node coupling.
- Contains: `src/*.ts` (resource modules), `src/types/` (typed models).
- Key files: `src/index.ts` (barrel), `src/galaxy.ts` (`GalaxyFetch` service + `makeGalaxyLayer`), `src/config.ts` (`BlendTypeConfig` + `makeConfigLayer`), `src/errors.ts` (tagged errors + `extractStatusCode`/`formatErrorMessage`), `src/histories.ts`, `src/workflows.ts`, `src/datasets.ts`, `src/jobs.ts`, `src/tools.ts`, `src/invocations.ts`.
- Build: `unbuild` (ESM/CJS dual, `dist/`).

**`packages/nuxt-galaxy/` — Nuxt module (runtime wiring):**
- `src/module.ts`: entry — `defineNuxtModule<ModuleOptions>`, option validation, moduleDependencies, evlog install, runtimeConfig, `addImports`/`addImportsDir`/`addServerHandler`/`addServerPlugin` registrations, Nitro task wiring.
- `src/runtime/app/`: client-side code.
  - `composables/` — `use*.ts` (galaxy/, parser/, database/ subfolders).
  - `queries/` — pinia-colada typed queries (galaxy/, supabase/).
  - `utils/` — client helpers (errors, analysis, supabase, workflowSlug).
- `src/runtime/server/`: server-side code.
  - `api/` — Nitro endpoints (`/api/galaxy/*`, `/api/db/*`, `/api/probe`).
  - `db/` — Drizzle `schema/{galaxy,galaxyRbac,auth,storage}/`, `migrations/`, `relations.ts`, seed files.
  - `utils/` — `drizzle.ts` (`Drizzle` service), `galaxy.ts` (`useGalaxyLayer`), `fetch.ts` (`UrlFetch`), `evlog-effect.ts` (`runGalaxyEffect`/`runTaskEffect`), `health.ts`, plus `utils/grizzle/` Effect DB repository modules.
  - `plugins/` — `galaxy.server.ts`, `evlog.server.ts`, `migrations.server.ts`.
  - `tasks/` — `galaxy/sync-analyses.ts` (Nitro task).
  - `lib/` — `migrate.ts`, `seed.ts`.
- `src/runtime/types/` — `database.ts` (Supabase generated types), `nuxt-galaxy.ts` (row/workflow/analysis types).

**`packages/ui/` — @gaas/ui Nuxt layer (presentation):**
- `nuxt.config.ts`: layer config — modules (`@nuxt/ui`, `nuxt-galaxy`, `@pinia/*`, `@pinia/colada-nuxt`, meili runtimeConfig), css.
- `app/app.config.ts`: `gaasUi.navigationMenuItems`.
- `app/components/`: feature folder components (`galaxy/`, `meili/`, `analysis/`, `workflow/`, `plot/`, `table/`).
- `app/composables/`: `use*` (galaxy parameter encode/decode, meili facet/search, database, mosaic).
- `app/pages/`: route pages (admin, analyses, datasets, galaxy, workflows).
- `app/layouts/`: `default.vue`, `landing.vue`, `auth.vue`.
- `app/schemas/` (zod), `app/types/`, `app/utils/` (table columns, filterSchema, fileTypeIcon).
- `app/assets/css/main.css` (Tailwind entry).
- Dev app lives in `.playground/` (referenced by `nuxi dev .playground`).

**`packages/wiki/` — @gaas/wiki Nuxt layer (content):**
- `nuxt.config.ts`: `extends: ['@gaas/ui']`, content hooks (DOI bibliography injection), evlog config.
- `app/pages/wiki/[...slug].vue`: content-driven catch-all route.
- `app/layouts/wiki/`: `article.vue`, `datatable.vue`.
- `app/components/content/`: `BibliographySection.vue`, `Ref.vue`.
- `app/composables/`: `useBibliography`, `useCitations`.
- `app/schemas/wiki.ts`, `app/utils/content/search.ts`.

**`packages/gaas-cli/` — Python CLI:**
- `src/gaas_cli/main.py`: Typer app entry (`gaas`).
- `src/gaas_cli/biblio/` (zotero, crossref, content), `content/collection/`, `meili/` (document, index, key, task), `schema/utils.py`.

**`docs/` — documentation site:**
- Nuxt content app: `app/`, `content/`, `content.config.ts`, `nuxt.config.ts`, `nuxt.schema.ts`.

**`playground/` — dev/test app:**
- `nuxt.config.ts`: `extends: ['../packages/wiki']`, devtools, `galaxy.useBlobUpload`.
- `app/`, `content/`, `server/`, `public/`, `playwright/` (if present).

**`repos/` — vendored upstreams** (read-only reference only, not imported): `effect`, `drizzle-orm`, `nuxt-supabase`, `nuxt-ui`, `vue-test-utils`, `zod`, `supabase-js`, `pinia-colada`, `nuxt-test-utils`, `d3-selection`, `d3-zoom`, `seqparse`.

## Key File Locations

**Entry Points:**
- `packages/blendtype/src/index.ts`: library barrel.
- `packages/nuxt-galaxy/src/module.ts`: Nuxt module setup/registration.
- `packages/ui/nuxt.config.ts`, `packages/wiki/nuxt.config.ts`, `playground/nuxt.config.ts`, `docs/nuxt.config.ts`: layer/app configs.
- `packages/gaas-cli/src/gaas_cli/main.py`: CLI entry.

**Configuration:**
- `pnpm-workspace.yaml`: workspace packages + `catalog:` / `catalog:nuxt` / `catalog:dataviz` / `catalog:testing` / `catalog:vue`.
- `package.json`: root scripts (dev, build, test, lint, typecheck, release, supabase:*).
- Root `vitest.config.ts`, `eslint.config.mjs`, `opencode.jsonc`, `.gitlab-ci.yml`, `renovate.json`.

**Core Logic:**
- Galaxy client: `packages/blendtype/src/` (resource modules + services).
- Server API + DB: `packages/nuxt-galaxy/src/runtime/server/` (`api/`, `utils/grizzle/`, `db/`).
- Client queries/composables: `packages/nuxt-galaxy/src/runtime/app/`.
- UI: `packages/ui/app/`.
- Content: `packages/wiki/app/`.

**Testing:**
- `packages/blendtype/test/` (unit, coverage via `@vitest/coverage-v8`).
- `packages/nuxt-galaxy/test/` (app, composables, fixtures, mocks, module, queries, server, utils).
- `packages/ui/test/` and `packages/ui/app/tests/` (components, composables).
- `packages/wiki/test/unit/`.
- `packages/gaas-cli/` (pytest; `tests/` if present).

## Naming Conventions

**Files:**
- TypeScript source: kebab-case (`useDatabaseWorkflow.ts`, `sync-analyses.ts`, `analysisMonitoring.ts`).
- Server API routes: Nitro file-based `<name>.<method>.ts` with dynamic segments — `analyses.post.ts`, `analyses/[analysisId].delete.ts`, `analyses/[id]/sync.post.ts`, `galaxy/workflows/[workflowId].get.ts` — plus an `addServerHandler` registration in `module.ts`.
- Server plugins: `<name>.server.ts` (`galaxy.server.ts`, `evlog.server.ts`, `migrations.server.ts`).
- Composables: `use*CamelCase.ts`.
- Vue SFC components: PascalCase (e.g. `AnalysisHistoryPanel.vue`, `BooleanToolParameter.vue`); subdirectory-lowercase containers (`galaxy/`, `meili/`, `workflow/`, `content/`).
- Schemas: domain-named (`wiki.ts`, `landing.ts`).

**Directories:**
- Feature/domain folders under `app/` and `runtime/`: `galaxy`, `supabase`, `database`, `parser`, `grizzle`, `meili`, `mosaic`, `plot`, `table`, `content`.
- Layer packages grouped by responsibility under `packages/`.

**Types:**
- Public row/workflow types as `*Row` / `New*` in `packages/nuxt-galaxy/src/runtime/types/nuxt-galaxy.ts` (e.g. `AnalysisRow`, `NewAnalysis`, `WorkflowRow`).
- Effect services as `Context.Tag` classes (e.g. `GalaxyFetch`, `Drizzle`, `ServerSupabaseClient`, `BlendTypeConfig`).
- Errors via `Data.TaggedError` (`*Error` suffix).

## Where to Add New Code

**New Galaxy API operation (server/client):**
- Blendtype client operation: add `*Effect()` function in the matching `packages/blendtype/src/<resource>.ts`, plus a `*()` Promise wrapper; re-export via `src/index.ts`; add types in `src/types/`.
- Server endpoint: add handler at `packages/nuxt-galaxy/src/runtime/server/api/<domain>/<name>.<method>.ts` and register it with `addServerHandler` in `src/module.ts`.

**New server DB accessor:**
- Drizzle schema: `packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/<table>.ts` (or `galaxyRbac/`, `storage/`, `auth/`); export from the folder `index.ts` / `relations.ts`.
- Effect repository: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/<domain>.ts` exposing `Effect`-returning functions that `yield* Drizzle`.

**New client composable / query:**
- Composable: `packages/nuxt-galaxy/src/runtime/app/composables/<domain>/use*.ts`, registered via `addImports` in `module.ts`.
- Query: `packages/nuxt-galaxy/src/runtime/app/queries/<domain>/<name>.ts` with `defineQueryOptions` + typed keys (auto-imported via `addImportsDir`).

**New UI component/page:**
- `packages/ui/app/components/<feature>/<Component>.vue`; pages under `packages/ui/app/pages/`; navigation via `app.config.ts` `gaasUi.navigationMenuItems`.

**New wiki content feature:**
- `packages/wiki/app/components/content/`, `composables/`, content under `content/wiki/`; content schema in `app/schemas/wiki.ts`.

**New CLI command (Python):**
- Subcommand group under `packages/gaas-cli/src/gaas_cli/` and wire into `main.py` Typer app.

**Tests:**
- Unit: `packages/blendtype/test/`, `packages/nuxt-galaxy/test/`; components alongside or under `packages/ui/test/`, `packages/wiki/test/unit/`; Python via pytest in `packages/gaas-cli/`.

## Special Directories

**`packages/nuxt-galaxy/src/runtime/server/db/migrations/`:**
- Purpose: Drizzle-kit SQL migrations + snapshots.
- Generated: Yes (by drizzle-kit).
- Committed: Yes.

**`packages/*/dist/`, `.nuxt/`, `.output/`, `.data/`, `.playground/`:**
- Purpose: Build/generated artifacts.
- Generated: Yes.
- Committed: No (gitignored).

**`repos/`:**
- Purpose: Vendored upstream source for reference.
- Generated: No.
- Committed: Yes (read-only; do not edit or import).

**`packages/nuxt-galaxy/supabase/`:**
- Purpose: Supabase local migration/snippets/temp for `pnpm supabase:*` commands (workdir `packages/nuxt-galaxy`).
- Generated: Partially (temp).
- Committed: Selected files only.

**`docs/.data/`, `playground/.data/`, `packages/ui/.data/`, `packages/wiki/.playground/.data/`:**
- Purpose: Nuxt content cache / local data.
- Generated: Yes.
- Committed: No.

---

*Structure analysis: 2026-08-10*
