# Coding Conventions

**Analysis Date:** 2026-08-10

## Overview

The GaaS monorepo is a pnpm workspace with three distinct coding styles, one per package family. Conventions differ by language and framework, so **match the surrounding package's style** rather than applying a global rule:

- **`packages/blendtype`** — Pure TypeScript library, Effect-TS functional programming.
- **`packages/nuxt-galaxy`**, **`packages/ui`**, **`packages/wiki`**, **`docs`** — Nuxt/Nitro/Vue.
- **`packages/gaas-cli`** — Python (Typer/Rich), managed with `uv`.

Per-package authoritative guides live in each package's `AGENTS.md` (`packages/blendtype/AGENTS.md`, `packages/nuxt-galaxy/AGENTS.md`, `packages/ui/AGENTS.md`, `packages/wiki/AGENTS.md`, `packages/gaas-cli/AGENTS.md`).

## TypeScript (blendtype + Nuxt packages)

### TypeScript Configuration

Strict mode enabled everywhere. `packages/blendtype/tsconfig.json` enables: `"strict": true`, `"noImplicitOverride": true`, `"noUncheckedIndexedAccess": true`, `"verbatimModuleSyntax": true`, `"module": "preserve"`, `"moduleResolution": "bundler"` (implied), `"isolatedModules": true`.

- Use `verbatimModuleSyntax` — **type-only imports must use `import type`** (never a mixed value/type import).
- `"noUncheckedIndexedAccess": true` — array/index access returns `T | undefined`; handle the undefined case (see `.?` optional chaining throughout `packages/blendtype/src/workflows.ts`).

### Naming Patterns

- **Files:** `kebab-case.ts` — `src/workflows.ts`, `src/types/visualization.ts`. Nuxt auto-importable files use the `use` prefix where semantic: `useGalaxyWorkflow.ts`, `useErrorMessage.ts`.
- **Functions:** `camelCase`. Effect functions end in `Effect` (`getWorkflowEffect`); their Promise wrappers drop the suffix (`getWorkflow`).
- **Variables/params:** `camelCase`. Effect generator params commonly named `function*` with `yield*` (see `Effect.gen(function* () {...})`).
- **Types/interfaces:** `PascalCase`, prefixed `Galaxy` for wire types — `GalaxyWorkflow`, `GalaxyWorkflowsItem` (`packages/blendtype/src/types/`).
- **Classes/errors:** `PascalCase` — `WorkflowError`, `GalaxyApiError`.
- **Context.Tag service classes:** `PascalCase` — `GalaxyFetch`, `BlendTypeConfig`, `Drizzle` (`packages/blendtype/src/galaxy.ts`, `src/config.ts`, `packages/nuxt-galaxy/src/runtime/server/utils/drizzle.ts`).

### Imports

- **Order (antfu convention):** 1) `node:` builtins, 2) external packages (alphabetical), 3) project-internal relative imports. See the import block in `packages/nuxt-galaxy/src/module.ts`.
- **Type imports:** use `import type { ... } from '...'` to comply with `verbatimModuleSyntax`.
- **Relative imports:** within `blendtype`, prefer `./types` aggregate imports with the explicit `.js` extension (`./types/index.js`) for ESM resolution. In Nuxt runtime code, extensionless relative imports are used.

### Formatting & Linting

- **Formatter:** ESLint with `@antfu/eslint-config` (`eslint.config.mjs` at repo root and per package). Enforced via `pnpm lint` / `pnpm lint --fix` and a `lint-staged` pre-commit hook (`package.json` → `simple-git-hooks`).
- **Style:** antfu defaults — **no semicolons**, 2-space indent, single quotes, trailing commas.
- **Vue enabled:** `antfu({ unocss: false, vue: true, ... })` in `eslint.config.mjs`. `unocss: false` because the project uses Nuxt UI, not UnoCSS.
- **Ignored:** `.agents/`, `.planning/`, and the generated Supabase types file `packages/nuxt-galaxy/src/runtime/types/database.ts`.

## Effect-TS Patterns (blendtype + nuxt-galaxy server)

### Dual Export API (`*Effect()` / Promise wrapper)

Every public operation exposes **two versions**:
1. **Effect version** for composition — `getWorkflowEffect(id)` returns `Effect<A, E, R>` (`packages/blendtype/src/workflows.ts:8`).
2. **Promise wrapper** for convenience — `getWorkflow(id, layer)` builds the pipeline and calls `Effect.runPromise` (`packages/blendtype/src/workflows.ts:29`).

```typescript
export function getWorkflowEffect(workflowId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    const workflow = Effect.tryPromise({
      try: () => fetchApi<GalaxyWorkflow>(`api/workflows/${workflowId}`, { method: 'GET' }),
      catch: caughtError => new WorkflowError({
        message: formatErrorMessage('workflow', workflowId, 'Error getting', caughtError),
        workflowId, statusCode: extractStatusCode(caughtError), cause: caughtError,
      }),
    })
    return yield* workflow
  }).pipe(withRetry)
}

export function getWorkflow(workflowId: string, layer: Layer.Layer<GalaxyFetch>) {
  return getWorkflowEffect(workflowId).pipe(
    toGalaxyServiceUnavailable, Effect.provide(layer), Effect.runPromise,
  )
}
```

In Nuxt server code (`packages/nuxt-galaxy/src/runtime/server/`), the wiring differs slightly: the Promise wrapper is not exported; instead handlers run Effects via `runGalaxyEffect` (see below).

### Error Handling — `Data.TaggedError`

- All domain errors are `Data.TaggedError` classes with a unique tag string and a `readonly` fields object (`packages/blendtype/src/errors.ts`).
- Handlers wrap `Effect.tryPromise`/`Effect.try` calls and map caught errors through `new WorkflowError({...})` using shared helpers:
  - `formatErrorMessage(resourceType, id, action, cause)` — builds `"Error getting workflow wf-123: <msg>"`.
  - `extractStatusCode(error)` — reads `.statusCode` (ofetch `FetchError`) or `.status`, including nested `cause`.
- Type-guard helpers (`isWorkflowError`, etc.) are exported for `instanceof`-style narrowing (`packages/blendtype/src/errors.ts:86`).
- `Data.TaggedError` classes use the **class-with-generics** form (`class WorkflowError extends Data.TaggedError('WorkflowError')<{...}> {}`) in `blendtype`, but some server files use the older `Data.TaggedError('...')<{...}>() {}` call form (e.g. `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/user.ts:15`). Prefer the class form for new code.

### Dependency Injection — `Context.Tag` + `Layer`

```typescript
export class GalaxyFetch extends Context.Tag('@blendtype/GalaxyFetch')<
  GalaxyFetch, ReturnType<typeof $fetch.create>
>() {
  static readonly Live = Layer.effect(GalaxyFetch, Effect.gen(function* () {
    const { apiKey, url } = yield* BlendTypeConfig
    return $fetch.create({ baseURL: url, headers: { 'x-api-key': apiKey } })
  }))
}
```

Pattern (`packages/blendtype/src/galaxy.ts`, `src/config.ts`):
- A `Context.Tag` class declares the service; the constructor generic self-reference `Context.Tag('@blendtype/X')<X, Impl>()` pairs the tag with its implementation type.
- A `static readonly Live` layer provides the real implementation.
- Test files construct their own layers with `Layer.succeed(Tag, mock)` (see TESTING.md).

### Cross-Cutting Retry / Mapping

- Galaxy fetch operations are wrapped with `withRetry` (defined in `packages/blendtype/src/galaxy.ts`) for transient-failure resilience; Promise wrappers always `.pipe(toGalaxyServiceUnavailable)` to map 503s to a `GalaxyServiceUnavailable` tagged error.

## Nuxt Module Patterns (nuxt-galaxy)

### Module Definition

`packages/nuxt-galaxy/src/module.ts` uses `defineNuxtModule<ModuleOptions>({ meta, moduleDependencies, defaults, hooks, setup })`:
- **`meta`:** `name`, `configKey` (`galaxy`), `compatibility` (`nuxt: '>=4.0.0'`).
- **`defaults`:** read from env (`process.env.GALAXY_URL || 'http://localhost:9000'`, etc.); non-secrets also mirrored into `runtimeConfig.public`, secrets only into private `runtimeConfig`.
- **`setup(options, nuxt)`:** registers composables via `addImports({ name, as, from })` (one entry per composable in a `composables` array), `addImportsDir` for `app/queries` and `app/utils`, `addServerImportsDir` for `server/utils` and `server/db`, `addServerHandler({ route, handler, method })` per Nitro route, and `addServerPlugin` for runtime plugins.
- Build-time diagnostics use `@nuxt/kit`'s `logger.withTag('nuxt-galaxy')`, **not** a wide-event logger (`packages/nuxt-galaxy/src/module.ts:16`).

### Module Options

Document every option with a `@default` / `@example` / `@docs` JSDoc block (`ModuleOptions` in `packages/nuxt-galaxy/src/module.ts:20`). Private runtime config types are augmented via `declare module '@nuxt/schema' { interface RuntimeConfig { ... } }` at the bottom of `module.ts`.

### Auto-imports

- Composables live under `src/runtime/app/composables/` and are named `useXxx`. Manual `addImports` preserves exact names (avoiding Nuxt's auto-import-name inference).
- Pinia Colada query options live in `src/runtime/app/queries/` and are bulk-registered via `addImportsDir`. Query modules export `defineQueryOptions` objects plus a `SUPABASE_ANALYSES_QUERY_KEYS`-style keys object built from `as const` arrays (`packages/nuxt-galaxy/src/runtime/app/queries/supabase/analyses.ts`).

### Server API Handler Convention

Each Nitro handler is a single `defineEventHandler` that returns `runGalaxyEffect(event, effect)` (`packages/nuxt-galaxy/src/runtime/server/api/galaxy/workflows.get.ts`):

```typescript
export default defineEventHandler(async (event) => {
  return runGalaxyEffect(
    event,
    getWorkflowsEffect().pipe(toGalaxyServiceUnavailable, Effect.provide(useGalaxyLayer())),
  )
})
```

- File naming follows the Nuxt route convention `<name>.<method>.ts` (`workflows.get.ts`, `[analysisId].delete.ts`).
- DB access is Drizzle via the `Drizzle` service tag (`packages/nuxt-galaxy/src/runtime/server/utils/drizzle.ts`); grizzle helpers under `runtime/server/utils/grizzle/` expose async `useDrizzle()` queries and matching `*Effect` variants that `yield* Drizzle`.

## Python Conventions (gaas-cli)

- **Runtime:** Python >= 3.13, managed with `uv` (`packages/gaas-cli/pyproject.toml`). Use `uv sync`, `uv run gaas ...`.
- **Formatter:** Black (line length 88, per `[tool.flake8] max-line-length = 88`).
- **Linter:** Ruff (`ruff check .`). Imports sorted via Ruff's isort rules.
- **CLI:** `typer.Typer` app with `app.add_typer(sub_app, name=..., help=...)` subcommand groups (`packages/gaas-cli/src/gaas_cli/main.py`). New subcommands namespace as subpackages (`meili/`, `biblio/`, `content/`, each with `app = typer.Typer(no_args_is_help=True)` and `@app.command()` functions, e.g. `src/gaas_cli/meili/index/__init__.py`).
- **Output:** `rich.console.Console` (`console = Console(stderr=True)`) with `rich.table.Table` for tabular output; `rich.pretty.pprint` for object dumps.
- **Data validation:** Pydantic v2 `BaseModel` with `model_config`.
- **Versioning:** `_version.py` is auto-generated by hatch + `uv-dynamic-versioning` (git tag prefix `gaas-cli-`). **Never edit `_version.py`**.
- Package state is passed via `ctx.obj` (e.g. a `client` set up in a callback, read by commands). Note: `src/gaas_cli/meili/index/__init__.py` reads `ctx.obj["client"]` while `main.py` currently sets only `ctx.obj = {"verbose": ...}` — a latent inconsistency (see CONCERNS follow-up if it bites).

## Logging (evlog)

Structured logging is defined authoritatively in `.planning/LOGGING-SPEC.md`. Five surfaces:

| Surface | Logger | Location |
|---|---|---|
| Server API routes | `const log = useLogger(event)` (auto-imported) → wrap effects in `runGalaxyEffect(event, effect)` | `packages/nuxt-galaxy/src/runtime/server/api/**` |
| Scheduled tasks/scripts | `createRequestLogger({ operation, requestId })`, call `emit()` once at end; wrap effects in `runTaskEffect(log, effect)` | `runtime/server/tasks/**`, `bin/*.mjs`, `runtime/server/lib/*.ts` |
| Client composables/components | `log` from `evlog/client` (auto-imported) | `packages/ui/app/**`, `packages/wiki/app/**` |
| Module lifecycle / build-time | `@nuxt/kit` `logger.withTag(...)` | `packages/nuxt-galaxy/src/module.ts` |
| Effect programs | `Effect.log*` / `Effect.logInfo` / `Effect.logError` (bridged by `evlogEffectLogger`) | `packages/blendtype/src/**`, `runtime/server/utils/**` |

Rules:
- **Never log secrets** — `GALAXY_API_KEY`, Supabase service keys, JWTs, tokens, full card numbers.
- Use explicit selected fields (`user.id`, `galaxy.workflowId`), never whole request bodies / raw Galaxy responses.
- Severity: `debug` verbose details, `info` normal ops, `warn` recoverable, `error` op-affecting, `fatal` system-wide.
- The Effect→evlog bridge is `evlogEffectLogger` in `packages/nuxt-galaxy/src/runtime/server/utils/evlog-effect.ts`. `Effect.logDebug` routes to evlog's global `log.debug` because `useLogger(event)` exposes no `debug` method.

## Cross-Package Boundaries

Import direction is strict (root `AGENTS.md`):
```
@gaas/wiki (extends) → @gaas/ui (extends) → nuxt-galaxy → blendtype
```
- **`wiki` must NOT import `nuxt-galaxy` directly** — go through `@gaas/ui`.
- **`ui` must NOT import `blendtype` directly** — go through `nuxt-galaxy` composables.
- **`blendtype`** is pure TS — no Nuxt/Node imports.
- Package-to-package deps use `workspace:*`.

## Error Handling Summary

| Surface | Strategy |
|---|---|
| blendtype library | `Data.TaggedError`, `Effect.tryPromise` catch → tagged error, `formatErrorMessage` + `extractStatusCode` |
| nuxt server handlers | `runGalaxyEffect`; Promise rejection → `GalaxyServiceUnavailable` for 503 |
| nuxt client | `getErrorMessage` / `toErrorWithMessage` / `getStatusCode` composables (`runtime/app/utils/errors.ts` + `useErrorMessage.ts`); `createError` for validation (from `#app` / h3) |
| query options | `defineQueryOptions` throws `createError({ statusCode: 400, message })` when required params are missing (`runtime/app/queries/supabase/analyses.ts`) |

## File Placement Conventions

- **Effect service modules:** one file per domain in `packages/blendtype/src/` (`workflows.ts`, `histories.ts`, `datasets.ts`...), types in `src/types/`, errors in `src/errors.ts`, all re-exported from `src/index.ts`.
- **Nuxt module runtime:** `src/runtime/app/{composables,queries,utils}/` for client code, `src/runtime/server/{api,utils,plugins,tasks,lib,db}/` for server code, `src/runtime/types/` for shared + generated types.
- **UI layer:** `app/components/`, `app/composables/`, `app/utils/`, `app/types/` (package `packages/ui/`).
- **Wiki layer:** `app/content/` (Markdown collections), `app/schemas/` (Zod content schemas), `app/pages/`, `app/utils/content/` (`packages/wiki/`).

---

*Convention analysis: 2026-08-10*
