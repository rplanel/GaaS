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

<!-- CODEGRAPH_START -->
## CodeGraph

This project has a CodeGraph MCP server (`codegraph_*` tools) configured. CodeGraph is a tree-sitter-parsed knowledge graph of every symbol, edge, and file. Reads are sub-millisecond and return structural information grep cannot.

### When to prefer codegraph over native search

Use codegraph for **structural** questions — what calls what, what would break, where is X defined, what is X's signature. Use native grep/read only for **literal text** queries (string contents, comments, log messages) or after you already have a specific file open.

| Question | Tool |
|---|---|
| "Where is X defined?" / "Find symbol named X" | `codegraph_search` |
| "What calls function Y?" | `codegraph_callers` |
| "What does Y call?" | `codegraph_callees` |
| "What would break if I changed Z?" | `codegraph_impact` |
| "Show me Y's signature / source / docstring" | `codegraph_node` |
| "Give me focused context for a task/area" | `codegraph_context` |
| "See several related symbols' source at once" | `codegraph_explore` |
| "What files exist under path/" | `codegraph_files` |
| "Is the index healthy?" | `codegraph_status` |

### Rules of thumb

- **Answer directly — don't delegate exploration.** For "how does X work" / architecture / trace questions, answer with 2-3 codegraph calls: `codegraph_context` first, then ONE `codegraph_explore` for the source of the symbols it surfaces. Codegraph IS the pre-built index, so spawning a separate file-reading sub-task/agent — or running a grep + read loop — repeats work codegraph already did and costs more for the same answer.
- **Trust codegraph results.** They come from a full AST parse. Do NOT re-verify them with grep — that's slower, less accurate, and wastes context.
- **Don't grep first** when looking up a symbol by name. `codegraph_search` is faster and returns kind + location + signature in one call.
- **Don't chain `codegraph_search` + `codegraph_node`** when you just want context — `codegraph_context` is one call.
- **Don't loop `codegraph_node` over many symbols** — one `codegraph_explore` call returns several symbols' source grouped in a single capped call, while each separate node/Read call re-reads the whole context and costs far more.
- **Index lag**: the file watcher debounces ~500ms behind writes; don't re-query immediately after editing a file in the same turn.

### If `.codegraph/` doesn't exist

The MCP server returns "not initialized." Ask the user: *"I notice this project doesn't have CodeGraph initialized. Want me to run `codegraph init -i` to build the index?"*
<!-- CODEGRAPH_END -->
