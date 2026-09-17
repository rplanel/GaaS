# Technology Stack

**Analysis Date:** 2026-08-10

## Languages

**Primary:**
- TypeScript `^5.9.3` (catalog:) - All core packages: `packages/blendtype`, `packages/nuxt-galaxy`, `packages/ui`, `packages/wiki`, `docs/`, `playground/`
- Python `>=3.13.0` - `packages/gaas-cli` CLI toolkit (`packages/gaas-cli/pyproject.toml`)
- Vue 3 (`vue: latest`, `vue-router: latest` in catalog) - SFC components across `packages/ui` and `packages/wiki`

**Secondary:**
- Markdown/MDX - Nuxt Content collections in `packages/wiki/content`, `docs/content`, `playground/content`
- SQL - Drizzle migrations in `packages/nuxt-galaxy/src/runtime/server/db/migrations/`

## Runtime

**Environment:**
- Node.js `24.12.0` (`.node-version`). AGENTS.md calls for v20+. Note CI (`.github/workflows/ci.yml`, `.gitlab-ci.yml`) uses Node 22.
- Python `3.13` (`.gitlab-ci.yml` `PYTHON_VERSION`, `packages/gaas-cli/pyproject.toml` `requires-python`)

**Package Manager:**
- pnpm `10.27.0` (root `package.json` `packageManager`, enforced via corepack in CI)
- Lockfile: `pnpm-lock.yaml` present at repo root
- Python deps via `uv` (managed in `packages/gaas-cli/`, `uv.lock`)

## Workspace & Catalogs

**Monorepo layout** defined in `pnpm-workspace.yaml`:
- Members: `packages/blendtype`, `packages/nuxt-galaxy`, `packages/ui`, `packages/wiki`, `docs`, `playground`
- `packages/gaas-cli` and `packages/llm` are NOT pnpm workspace members (gaas-cli is a separate uv-managed Python package; `packages/llm` is empty)

**Version Catalogs** (all deps use `catalog:` / `catalog:nuxt` / `catalog:dataviz` / `catalog:testing` / `catalog:vue` references rather than inline versions):
- `catalog:` - core (effect, zod, typescript, eslint, evlog, drizzle)
- `catalog:nuxt` - Nuxt ecosystem (@nuxt/ui, @nuxt/content, @nuxtjs/supabase, nuxt-studio)
- `catalog:dataviz` - d3, @uwdata/mosaic-*, @observablehq/plot
- `catalog:testing` - vitest, playwright-core, happy-dom, msw
- `catalog:vue` - pinia, @pinia/colada

## Frameworks

**Core:**
- Nuxt `^4.3.0` (catalog:nuxt) - Full-stack framework for `packages/nuxt-galaxy`, `packages/ui`, `packages/wiki`, `docs/`, `playground/` (each has its own `nuxt.config.ts`)
- Effect-TS `^3.19.6` (catalog:) - Functional programming runtime. Core of `packages/blendtype` (Galaxy API client) and server logic in `packages/nuxt-galaxy/src/runtime/server/utils/`
- @nuxt/ui `^4.6.1` (catalog:nuxt) - UI component library, used in `packages/ui` and `packages/wiki`
- Nuxt Content `^3.11.2` (catalog:nuxt) - Content collections (`packages/wiki/content.config.ts`, `docs/content.config.ts`)
- @nuxtjs/supabase `^2.0.4` (catalog:nuxt) - Supabase SSR auth + client (`packages/nuxt-galaxy` module dependency)
- Drizzle ORM `^1.0.0-beta.16` (catalog:) - DB ORM (`packages/nuxt-galaxy/src/runtime/server/db/`)
- Pinia `^3.0.4` + @pinia/colada `^1.3.1` (catalog:vue) - State + server data caching (`packages/ui/app/composables/`, `packages/nuxt-galaxy/src/runtime/app/queries/`)

**Testing:**
- Vitest `^4.1.0` (catalog:testing) - Unit/integration
- @vue/test-utils `^2.4.6` (catalog:testing) - Vue component tests
- Playwright-core `^1.56.1` (catalog:testing) - E2E
- MSW `^2.12.12` (catalog:testing) - HTTP mocking
- happy-dom `^20.4.0` (catalog:testing) - DOM environment
- Python: pytest via `[dependency-groups]` in `packages/gaas-cli/pyproject.toml`

**Build/Dev:**
- unbuild `^3.6.1` (catalog:) - `packages/blendtype` build (ESM/CJS dual output)
- @nuxt/module-builder `^1.0.2` (catalog:nuxt) - `packages/nuxt-galaxy` module build
- drizzle-kit `^1.0.0-beta.16` (catalog:) - DB migration generation (`packages/nuxt-galaxy/drizzle.config.ts`, `.galaxy.ts`, `.rbac.ts`)
- esbuild `^0.27.0` (catalog:), jiti `^2.6.1` (catalog:)
- Typer `>=0.20.0` + Rich (packages/gaas-cli/pyproject.toml) - Python CLI framework
- hatchling + uv-dynamic-versioning (packages/gaas-cli build backend)

## Key Dependencies

**Critical:**
- `effect` `^3.19.6` - Functional streaming/DI for Galaxy client and server logic
- `drizzle-orm` `^1.0.0-beta.16` + `postgres` `^3.4.7` - DB access (postgres-js driver)
- `ofetch` `^1.5.1` + `ufo` `^1.6.1` - HTTP client/URL utils (blendtype GalaxyFetch, `packages/blendtype/src/galaxy.ts`)
- `tus-js-client` `^4.3.1` - Resumable uploads to Galaxy (`packages/blendtype/src/`)
- `zod` `^4.3.6` + `zod-validation-error` `^5.0.0` - Schema validation (`packages/ui/app/schemas/`, `packages/wiki/app/schemas/`)
- `evlog` `^2.22.3` - Structured logging (installed as Nuxt module `evlog/nuxt` in `packages/wiki/nuxt.config.ts`)
- `meilisearch` `^0.53.0` - Search client (`packages/ui/app/composables/meili/`, `packages/gaas-cli`)
- `@dotenvx/dotenvx` `^1.52.0` (catalog:) - env handling

**Dataviz (catalog:dataviz used by `packages/ui`):**
- d3 `^7.9.0`, @types/d3
- @uwdata/mosaic-core / mosaic-sql / vgplot `^0.26.0` - declarative dataviz (`packages/ui/app/composables/mosaic/`)
- @observablehq/plot `^0.6.17`, htl, apache-arrow `^21.1.0` (table/arrow), d3-dsv

**Icon sets (catalog: `@iconify-json/*`)** - lucide, mdi, tabler, solar, eos-icons, etc., used by `packages/ui` and `packages/wiki`

**Infrastructure:**
- `supabase` `^2.72.8` (catalog:) CLI - local dev DB (via `packages/nuxt-galaxy` supabase scripts)
- `better-sqlite3` `^12.4.6` - wiki content (via @nuxt/content SQLite)
- `sharp` (build dep, via Nuxt image)

**Linting/Formatting (root + packages):**
- ESLint `^9.39.1` + @antfu/eslint-config `^6.7.1`, eslint-config-unjs (blendtype), @unocss/eslint-plugin, eslint-plugin-format
- Config: `eslint.config.mjs` (root), `packages/nuxt-galaxy/eslint.config.mjs` etc.
- simple-git-hooks + lint-staged (root `package.json`, pre-commit hook)

## Configuration

**Environment:**
- Runtime config via Nuxt `runtimeConfig` (see INTEGRATIONS.md for env vars). `.env` is gitignored; no committed `.env.example` found.
- Module options declared in `packages/nuxt-galaxy/src/module.ts` (`configKey: 'galaxy'`)
- gaas-cli config via Typer envvar options (`MEILI_HOST`, `MEILI_MASTER_KEY` in `packages/gaas-cli/src/gaas_cli/meili/__init__.py`)

**Build:**
- `pnpm-workspace.yaml` (catalogs + workspace membership)
- Per-package `nuxt.config.ts`, `drizzle.config*.ts`, `vitest.config.ts` / `vitest.config.server.ts`, `tsconfig.json`
- Root scripts in `package.json` (dev, build, release, lint, test, typecheck, supabase:*)

## Platform Requirements

**Development:**
- Node.js >= 20 (`24.12.0` pinned), pnpm 10.27.0, Python 3.13 + uv
- Local Supabase via `pnpm supabase:start` (postgres on port 54322 by default per `module.ts` default `databaseUrl`)
- Local MeiliSearch on `http://localhost:7700` (default `MASTER_KEY`)
- pnpm `trustPolicy` / `ignoredBuiltDependencies` / `onlyBuiltDependencies` for native builds (see `pnpm-workspace.yaml`)

**Production:**
- NUXT_UI_PRO_LICENSE secret needed for Nuxt UI Pro build (`.gitlab-ci.yml`, `.github/workflows/ci.yml`)
- Docs deployed as GitLab Pages static site (`docs/.output/public`)
- npm packages published (blendtype, nuxt-galaxy, @gaas/ui, @gaas/wiki) via pkg-pr-new in CI

---

*Stack analysis: 2026-08-10*
