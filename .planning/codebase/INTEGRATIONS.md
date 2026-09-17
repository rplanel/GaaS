# External Integrations

**Analysis Date:** 2026-08-10

## APIs & External Services

**Galaxy (REST API)** - primary external service, wrapped by `packages/blendtype`:
- SDK/Client: `packages/blendtype` (ofetch + Effect-TS), configured in `packages/blendtype/src/galaxy.ts` (`GalaxyFetch.Live`, `makeGalaxyLayer`) and `packages/blendtype/src/config.ts`
- Auth: `x-api-key` header
- Server-side use: `packages/nuxt-galaxy/src/runtime/server/utils/galaxy.ts`, proxied via server handlers `/api/galaxy/*` (registered in `packages/nuxt-galaxy/src/module.ts`)
- Config: `GALAXY_URL`, `GALAXY_API_KEY`, `GALAXY_EMAIL` (module defaults in `packages/nuxt-galaxy/src/module.ts`)

**Zotero (bibliography API)** - used by gaas-cli:
- SDK/Client: `pyzotero` (`packages/gaas-cli/src/gaas_cli/biblio/zotero.py`)
- Purpose: fetch references from Zotero collections (csljson) to feed wiki content/bibliography
- Auth: Zotero API key + library_id; CLI parameters passed to `gen_fetch_from_zotero`

**Crossref (bibliography API)** - used by gaas-cli:
- REST API `https://api.crossref.org/works/{doi}` via `requests` (`packages/gaas-cli/src/gaas_cli/biblio/crossref.py`)
- Purpose: DOI metadata enrichment for bibliography

**MeiliSearch** - search engine, used by both `packages/ui` and `packages/gaas-cli`:
- SDK/Client: `meilisearch` npm package (`packages/ui/app/composables/meili/useMeiliSearch.ts`) and `meilisearch` Python package (`packages/gaas-cli/src/gaas_cli/meili/`)
- Config: `/api/meili` runtime config in `packages/ui/nuxt.config.ts` (`meilisearch.hostUrl`, `meilisearch.searchApiKey`); gaas-cli uses `MEILI_HOST`, `MEILI_MASTER_KEY` envvars
- Purpose: full-text search over wiki/content indexes; gaas-cli manages indexes (`meili index ls`, `meili key`, `meili task`, `meili document` — see `packages/gaas-cli/src/gaas_cli/main.py`)

## Data Storage

**Databases:**
- PostgreSQL via **Supabase** (primary app DB, `galaxy` + `galaxy_rbac` + `auth` + `storage` schemas)
  - Connection: `GALAXY_DRIZZLE_DATABASE_URL` (server); reached through `drizzle-orm/postgres-js` + `postgres` driver (`packages/nuxt-galaxy/src/runtime/server/utils/drizzle.ts` and `packages/nuxt-galaxy/src/runtime/server/db/index.ts`)
  - Client: Drizzle ORM; schema in `packages/nuxt-galaxy/src/runtime/server/db/schema/{galaxy,galaxyRbac,auth,storage}/`; migrations in `packages/nuxt-galaxy/src/runtime/server/db/migrations/`
  - Module config: `databaseUrl` option (`packages/nuxt-galaxy/src/module.ts`)
- SQLite via `better-sqlite3` (wiki content storage through @nuxt/content) - `packages/wiki/package.json`

**File Storage:**
- Supabase Storage - datasets blob/bucket handling; schema `packages/nuxt-galaxy/src/runtime/server/db/schema/storage/`; upload via `packages/nuxt-galaxy/src/runtime/app/composables/useUploadFileToStorage.ts` and `useDatasetSignedUrl.ts`
- Blob-upload mode toggle: `useBlobUpload` module option (forces direct binary upload to Galaxy when instance can't reach Supabase storage)

**Caching:**
- Client query caching via **@pinia/colada** (query keys: `SUPABASE_*_QUERY_KEYS`, `GALAXY_*_QUERY_KEYS` config vars) — `packages/nuxt-galaxy/src/runtime/app/queries/`
- Not applicable server-side beyond DB; sync locks via `syncLocks` table (`packages/nuxt-galaxy/src/runtime/server/db/schema/galaxy/syncLocks.ts`)

## Authentication & Identity

**Auth Provider:**
- **Supabase Auth** (via `@nuxtjs/supabase`)
  - Implementation: SSR auth, `useSupabaseUser` / client composables; module default redirect options (`/login`, `/confirm`) in `packages/nuxt-galaxy/src/module.ts` and `packages/wiki/nuxt.config.ts`
  - Server-side privileged DB access uses service role key (`packages/nuxt-galaxy/src/runtime/server/utils/grizzle/supabase.ts` reads `SUPABASE_SERVICE_ROLE_KEY` / `NUXT_SUPABASE_SECRET_KEY`)
- RBAC: custom `galaxy_rbac` schema with `roles`, `userRoles`, `rolePermissions` (`packages/nuxt-galaxy/src/runtime/server/db/schema/galaxyRbac/`); enforced via `useUserRole` composable (`packages/nuxt-galaxy/src/runtime/app/composables/useUserRole.ts`)

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry/etc.)

**Logs:**
- **evlog** - structured, request-scoped wide-event logging (evlog/nuxt module in `packages/wiki/nuxt.config.ts`, installed by nuxt-galaxy module; drain at `packages/nuxt-galaxy/src/runtime/server/utils/evlog-drain.ts`, Effect adapter at `evlog-effect.ts`). Logging spec: `.planning/LOGGING-SPEC.md`

## CI/CD & Deployment

**Hosting:**
- **GitLab Pages** for documentation (`docs/.output/public`) — `.gitlab-ci.yml` `deploy:docs`
- npm package publishing (blendtype, nuxt-galaxy, @gaas/ui, @gaas/wiki)
- **GitLab Package Registry** (PyPI) for `gaas-cli` wheels

**CI Pipeline:**
- GitLab CI (`.gitlab-ci.yml`): publish gaas-cli on tag, deploy docs on main/docs branches
- GitHub Actions (`.github/workflows/ci.yml`): lint, build, publish preview packages via `pkg-pr-new`
- Renovate (`renovate.json`) for dependency updates; `commit-and-tag-version` for releases (root `package.json` `release` script)

## Environment Configuration

**Required env vars:**
- `GALAXY_URL` - Galaxy server base URL (default `http://localhost:9000`)
- `GALAXY_API_KEY` - Galaxy API key (default `fakekey`)
- `GALAXY_EMAIL` - Galaxy user email (default `admin@example.org`)
- `GALAXY_DRIZZLE_DATABASE_URL` - Postgres/Supabase connection string (default local:54322)
- `NUXT_UI_PRO_LICENSE` - Nuxt UI Pro license (build-time, in CI)
- Supabase vars (used implicitly by @nuxtjs/supabase / server): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` / `NUXT_SUPABASE_SECRET_KEY`, plus `SUPABASE_ANON_KEY`/client side via module
- gaas-cli: `MEILI_HOST` (default `http://localhost:7700`), `MEILI_MASTER_KEY` (default `MASTER_KEY`)

**Secrets location:**
- `.env` (gitignored — see `.gitignore`); no committed `.env.example` found
- CI secrets via GitLab CI variables / GitHub Actions secrets

## Webhooks & Callbacks

**Incoming:**
- Not detected as external webhook endpoints. Internal server routes include `/api/probe`, `/api/galaxy/*`, `/api/db/*` (registered in `packages/nuxt-galaxy/src/module.ts`)

**Outgoing:**
- Scheduled Nitro task `galaxy:sync-analyses` (cron `*/30 * * * * *`) syncs Galaxy analyses to Supabase — `packages/nuxt-galaxy/src/module.ts` (`scheduledTasks`), handler `packages/nuxt-galaxy/src/runtime/server/tasks/galaxy/sync-analyses`

## Other Notable Integrations

**Observable Plot / Mosaic / DuckDB (frontend dataviz):**
- @observablehq/plot, @uwdata/{mosaic-core,mosaic-sql,vgplot}, apache-arrow, htl (catalog:dataviz) used in `packages/ui/app/composables/mosaic/` and `packages/ui/app/composables/plot/` — client-side DuckDB-backed visualization

**Nuxt Content / Studio:**
- @nuxt/content for wiki + docs content collections; nuxt-studio for content editing (all Nuxt packages)
- `packages/wiki/nuxt.config.ts` `content:file:afterParse` hook enriches wiki content with DOI-based bibliography via `searchContentRef` (`packages/wiki/app/utils/content/search.ts`)

**TUS resumable uploads:**
- `tus-js-client` in blendtype for large file uploads to Galaxy

---

*Integration audit: 2026-08-10*
