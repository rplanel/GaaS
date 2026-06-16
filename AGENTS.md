# AGENTS.md - GaaS Monorepo Guide

## Section 1: Stack Definition With Exact Versions

| Component | Version | Purpose |
|-----------|---------|---------|
| **Package Manager** | pnpm@10.27.0 | Workspace management |
| **Node.js** | v20+ | Runtime environment |
| **TypeScript** | ^5.9.3 (catalog:) | Type safety |
| **ESLint** | ^9.39.1 + @antfu/eslint-config@^6.7.1 | Linting |
| **Nuxt** | ^4.3.0 (catalog:nuxt) | Framework |
| **Effect-TS** | ^3.19.6 (catalog:) | Functional programming |
| **Vitest** | ^4.1.0 (catalog:testing) | Testing |

### Workspace Members
```
docs/                    # @gaas/docs - Documentation site
packages/
  blendtype/             # TypeScript library (Galaxy API)
  nuxt-galaxy/           # Nuxt module (Galaxy integration)
  ui/                    # @gaas/ui - Nuxt UI layer
  wiki/                  # @gaas/wiki - Content layer
  gaas-cli/              # Python CLI tool
  llm/                   # LLM utilities
playground/              # Test application
```

### Dependency Catalogs
- `catalog:` - Main deps (effect, zod, eslint, typescript)
- `catalog:nuxt` - Nuxt ecosystem (@nuxt/ui, @nuxt/content, @nuxtjs/supabase)
- `catalog:dataviz` - Visualization (d3, @uwdata/mosaic-*)
- `catalog:testing` - Testing (vitest, playwright, happy-dom)
- `catalog:vue` - Vue ecosystem (pinia, @pinia/colada)

## Section 2: Executable Commands With Full Flags

### Root-Level Commands
```bash
# Development
pnpm dev                                    # Run playground dev server
pnpm dev:prepare                           # Prepare all packages for dev
pnpm --filter ./packages/blendtype dev    # Run specific package

# Build & Release
pnpm build                                  # Build all packages (prepack)
pnpm release                                # Full release: lint + test + changelog + publish + push
pnpm release --dry-run                     # Preview only

# Testing
pnpm test                                   # Run tests across all packages
pnpm --filter './packages/**' test        # Filtered test run

# Quality Assurance
pnpm lint                                   # Lint all packages
pnpm lint --fix                            # Auto-fix lint issues
pnpm typecheck                              # Type check all packages

# Dependencies
pnpm cleandep                               # Clean all node_modules + lockfile + reinstall
pnpm install                               # Install all dependencies

# Supabase (via nuxt-galaxy)
pnpm supabase:start                         # Start Supabase local dev
pnpm supabase:stop                          # Stop Supabase
pnpm supabase:status                        # Check status

# Documentation
pnpm docs:dev                               # Dev server for docs
pnpm docs:build                             # Build docs
pnpm docs:generate                          # Static site generation
```

### Package-Specific Commands
```bash
# From packages/blendtype/
pnpm build          # unbuild (ESM/CJS output)
pnpm test           # vitest run
cd ../.. && pnpm test -w packages/blendtype

# From packages/nuxt-galaxy/
pnpm dev            # Nuxt dev with playground
pnpm supabase:start # Start local Supabase
pnpm db:seed        # Seed database

# From packages/ui/ or packages/wiki/
pnpm dev            # Dev in .playground/
pnpm typecheck      # vue-tsc --noEmit
```

## Section 3: Coding Conventions and Patterns

### General Rules
- **pnpm Catalogs**: Always use `catalog:` references in package.json
  ```json
  { "effect": "catalog:", "nuxt": "catalog:nuxt" }
  ```
- **Workspace Dependencies**: Use `workspace:*` for cross-package imports
- **TypeScript**: Strict mode enabled in all packages

### blendtype (TypeScript Library)
- **Architecture**: Effect-TS functional programming
- **Pattern**: Dual export - `*Effect()` for composition, `*()` Promise wrapper
- **Errors**: `Data.TaggedError("ErrorName")` with unique symbols
- **DI**: Context.Tag + Layer-based dependency injection
- **Build**: ESM/CJS dual format via unbuild

### Nuxt Packages (nuxt-galaxy, ui, wiki)
- **Module Pattern**: Use `defineNuxtModule<ModuleOptions>()` with complete meta
- **Auto-imports**: Register via `addImports()`, `addImportsDir()`, `addServerHandler()`
- **Server**: API handlers in `runtime/server/api/`
- **Layers**: Extend via `extends: ['@gaas/ui']` in nuxt.config

### Python CLI (gaas-cli)
- **Framework**: Typer with Rich for terminal output
- **Entry**: `gaas` command from `gaas_cli.main:app`
- **Dependencies**: Manage with `uv` (not pip)

## Section 4: Testing Rules

### Test Commands
```bash
# Root level
pnpm test                                    # All package tests
pnpm --filter ./packages/blendtype test     # Specific package
pnpm --filter ./packages/blendtype vitest run --coverage

# Package level
pnpm test                                    # Run tests
pnpm test:watch                              # Watch mode
```

### Testing Standards
- **Framework**: Vitest + @vue/test-utils for Vue/Nuxt
- **Mocking**: MSW for HTTP, Effect Layer.succeed() for services
- **E2E**: Playwright for UI/wiki packages
- **Coverage**: Required for blendtype, tracked via @vitest/coverage-v8
- **Python**: pytest for gaas-cli

### Test Locations
- Unit: `test/` directory
- Components: `*.test.ts` alongside source
- E2E: `playwright/tests/` or `.playground/`

## Section 5: "Don't Touch" Zones and Permission Boundaries

### Protected Files (DO NOT MODIFY)
1. **pnpm-workspace.yaml** - Catalog versions, workspace packages list
2. **Root package.json scripts** - Use --filter to customize
3. **Generated directories** - `.nuxt/`, `dist/`, `.output/` - never commit

### Layer Dependency Architecture
```
@gaas/wiki (extends) → @gaas/ui (extends) → nuxt-galaxy → blendtype
```
- **Direction**: Downstream layers import upstream only
- **Violation**: wiki CANNOT import nuxt-galaxy directly (use UI abstractions)

### Package Boundaries
- **blendtype**: Pure TypeScript library, NO Nuxt/Node code
- **nuxt-galaxy**: Nuxt module ONLY, server-side DB via Drizzle
- **ui**: UI components/composables, NO pages or content
- **wiki**: Content collections + pages, imports UI only
- **docs**: Documentation content, NO library code

### Git Hooks
- **pre-commit**: `pnpm lint --fix` via lint-staged
- **Never bypass**: `HUSKY=0` or `--no-verify` prohibited

### Environment Variables
- **Required**: GALAXY_URL, GALAXY_API_KEY, GALAXY_EMAIL
- **Optional**: GALAXY_DRIZZLE_DATABASE_URL (defaults to local)
- **Security**: .env files gitignored, never commit secrets

## Vendored Repositories

This project vendors external repositories under @repos/

  - Use vendored repositories as read-only reference material when working with related libraries
  - Prefer examples and patterns from the vendored source code over generated guesses or web search results
  - Do not edit files under @repos/ unless explicitly asked
  - Do not import from @repos/ - application code should continue importing from normal package dependencies

When writing Effect code, inspect @repos/effect/ for examples of idiomatic usage, tests, module structure, and API design. Treat it as the source of truth for Effect patterns.

---

## context-mode — MANDATORY routing rules

context-mode MCP tools available. Rules protect context window from flooding. One unrouted command dumps 56 KB into context.

### Think in Code — MANDATORY

Analyze/count/filter/compare/search/parse/transform data: **write code** via `context-mode_ctx_execute(language, code)`, `console.log()` only the answer. Do NOT read raw data into context. PROGRAM the analysis, not COMPUTE it. Pure JavaScript — Node.js built-ins only (`fs`, `path`, `child_process`). `try/catch`, handle `null`/`undefined`. One script replaces ten tool calls.

### BLOCKED — do NOT attempt

#### curl / wget — BLOCKED
Shell `curl`/`wget` intercepted and blocked. Do NOT retry.
Use: `context-mode_ctx_fetch_and_index(url, source)` or `context-mode_ctx_execute(language: "javascript", code: "const r = await fetch(...)")`

#### Inline HTTP — BLOCKED
`fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, `http.request(` — intercepted. Do NOT retry.
Use: `context-mode_ctx_execute(language, code)` — only stdout enters context

#### Direct web fetching — BLOCKED
Use: `context-mode_ctx_fetch_and_index(url, source)` then `context-mode_ctx_search(queries)`

### REDIRECTED — use sandbox

#### Shell (>20 lines output)
Shell ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`.
Otherwise: `context-mode_ctx_batch_execute(commands, queries)` or `context-mode_ctx_execute(language: "shell", code: "...")`

#### File reading (for analysis)
Reading to **edit** → reading correct. Reading to **analyze/explore/summarize** → `context-mode_ctx_execute_file(path, language, code)`.

#### grep / search (large results)
Use `context-mode_ctx_execute(language: "shell", code: "grep ...")` in sandbox.

### Tool selection

0. **MEMORY**: `context-mode_ctx_search(sort: "timeline")` — after resume, check prior context before asking user.
1. **GATHER**: `context-mode_ctx_batch_execute(commands, queries)` — runs all commands, auto-indexes, returns search. ONE call replaces 30+. Each command: `{label: "header", command: "..."}`.
2. **FOLLOW-UP**: `context-mode_ctx_search(queries: ["q1", "q2", ...])` — all questions as array, ONE call (default relevance mode).
3. **PROCESSING**: `context-mode_ctx_execute(language, code)` | `context-mode_ctx_execute_file(path, language, code)` — sandbox, only stdout enters context.
4. **WEB**: `context-mode_ctx_fetch_and_index(url, source)` then `context-mode_ctx_search(queries)` — raw HTML never enters context.
5. **INDEX**: `context-mode_ctx_index(content, source)` — store in FTS5 for later search.

### Parallel I/O batches

For multi-URL fetches or multi-API calls, **always** include `concurrency: N` (1-8):

- `context-mode_ctx_batch_execute(commands: [3+ network commands], concurrency: 5)` — gh, curl, dig, docker inspect, multi-region cloud queries
- `context-mode_ctx_fetch_and_index(requests: [{url, source}, ...], concurrency: 5)` — multi-URL batch fetch

**Use concurrency 4-8** for I/O-bound work (network calls, API queries). **Keep concurrency 1** for CPU-bound (npm test, build, lint) or commands sharing state (ports, lock files, same-repo writes).

GitHub API rate-limit: cap at 4 for `gh` calls.

### Output

Write artifacts to FILES — never inline. Return: file path + 1-line description.
Descriptive source labels for `search(source: "label")`.

### Session Continuity

Skills, roles, and decisions persist for the entire session. Do not abandon them as the conversation grows.

### Memory

Session history is persistent and searchable. On resume, search BEFORE asking the user:

| Need | Command |
|------|---------|
| What did we decide? | `context-mode_ctx_search(queries: ["decision"], source: "decision", sort: "timeline")` |
| What constraints exist? | `context-mode_ctx_search(queries: ["constraint"], source: "constraint")` |

DO NOT ask "what were we working on?" — SEARCH FIRST.
If search returns 0 results, proceed as a fresh session.

### ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call `stats` MCP tool, display full output verbatim |
| `ctx doctor` | Call `doctor` MCP tool, run returned shell command, display as checklist |
| `ctx upgrade` | Call `upgrade` MCP tool, run returned shell command, display as checklist |
| `ctx purge` | Call `purge` MCP tool with confirm: true. Warns before wiping knowledge base. |

After /clear or /compact: knowledge base and session stats preserved. Use `ctx purge` to start fresh.
