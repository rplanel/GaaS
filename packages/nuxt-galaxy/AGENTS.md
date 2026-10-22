# AGENTS.md - nuxt-galaxy Nuxt Module

## Section 1: Stack Definition With Exact Versions

| Component | Version | Purpose |
|-----------|---------|---------|
| **Nuxt** | ^4.3.0 (catalog:nuxt) | Framework |
| **Drizzle ORM** | ^1.0.0-beta.16 (catalog:) | Database access |
| **Supabase** | ^2.72.8 (catalog:) | Auth + Database |
| **Effect-TS** | ^3.19.6 (catalog:) | Server-side effects |
| **@nuxt/kit** | ^4.3.0 (catalog:nuxt) | Module development |
| **Drizzle-Kit** | ^1.0.0-beta.16 (catalog:) | Migrations |
| **JWT Decode** | ^4.0.0 (catalog:) | Token parsing |

### Module Dependencies
The module installs what it needs and nothing that only the UI layer needs
(ADR 0009). Each is both a `moduleDependencies` entry in `src/module.ts` and a
package dependency: an app on this module alone has nothing else to install
them from, and fails to load with "Could not resolve `@pinia/nuxt` (specified
as a dependency of `nuxt-galaxy`)" when the package dependency is missing.
`test/module/dependencies.test.ts` reads what the fixture installed.
- `@nuxtjs/supabase`, version-checked against `^2.0.3`, with the client on
  the `galaxy` schema. **No sign-in redirect options**: the pages they name
  belong to whichever UI the app uses, and Nuxt concatenates a dependency's
  array defaults with the app's, so a public page set here is one no app
  could remove. `@gaas/ui` sets its own.
- `@pinia/nuxt` and `@pinia/colada-nuxt`, version-checked against `^0.11.3`
  and `^1.0.1`, the `catalog:nuxt` ranges package.json declares, because the
  queries in `runtime/app/queries` are Pinia Colada query options. Nuxt skips
  a module dependency the app already lists, so an app that lists either
  itself gets it once.
- Not `@nuxt/content`: only the UI layer's wiki reads it (ADR 0008).

### Package Dependencies
- `blendtype`: workspace:* (Galaxy API client)

### Peer Dependencies
- `h3`: ^1.15.11 (catalog:), the range `@nuxt/nitro-server` and `nitropack`
  declare. The server runtime imports it by name, and the event a handler is
  handed is Nitro's, so the copy that counts is the app's: hence a peer. It is
  a devDependency as well, so that inside the workspace the package resolves
  its own declared copy. Undeclared, it resolved to whatever
  `shamefully-hoist` put at the root, and an incremental install once hoisted
  2.0.1-rc.22 (pulled by `devframe`), turning the gates red for no reason
  (#81). Since then a reused `node_modules` can no longer change which h3 the
  module sees. Run `pnpm build` and `pnpm dev:prepare` before trusting a gate
  all the same: stale dists and generated `.nuxt` tsconfigs still mislead.

## Section 2: Executable Commands With Full Flags

### Development
```bash
# Dev with playground
pnpm dev                                    # Start Nuxt dev with playground
pnpm dev:build                             # Build playground
pnpm dev:prepare                           # Prepare module + playground
```

### Testing & Linting
```bash
pnpm lint                                   # ESLint check
pnpm typecheck                              # vue-tsc + playground typecheck
pnpm test                                   # Vitest run: module, server, then playground
pnpm test:playground                        # The playground's mounted pages alone
pnpm test:watch                             # Vitest watch mode
```

### The playground is the second UI
`playground/` is the second UI that ADR 0009 uses as proof that the line
between this module and `@gaas/ui` holds. It is plain HTML on this module
alone: no Tailwind, no Nuxt UI, and its pages import only `nuxt-galaxy`, Vue
and Nuxt. If a page needs logic that lives in `@gaas/ui`, the move to this
module is a ticket of its own, landed first. Do not copy it into the
playground.

A `no-restricted-imports` rule in the root `eslint.config.mjs` refuses
imports of `@gaas/ui`, `@nuxt/ui` and `#layers/**` from anywhere under
`playground/`. The workspace hoists `@gaas/ui` and `@nuxt/ui`, so an import
of either would otherwise resolve. The rule checks static imports only.
Review has to catch three things it cannot see:
- a dynamic `import()`;
- a relative path into `packages/ui`;
- a layer or module named in `playground/nuxt.config.ts`, which is a string,
  not an import.

The playground names its own sign-in routes: `/login`, and `/confirm` as the
callback. Those are `@nuxtjs/supabase`'s defaults, written out because this
module sets none. No page is served at `/confirm`, because a password
sign-in never comes back through it.

`/start` starts an analysis (#165). The reader chooses an active workflow,
picks a dataset for each input and names the analysis. The page validates
through `startAnalysisSchema`, refuses through `startAnalysisRefused` and
says why, and starts through `useStartAnalysis`. `start` applies neither the
schema nor the gate itself, so a page that skips them sends what they would
refuse. It sends the parameters saved in the revision its version pins, as
the reader has edited them (#167).

What each parameter's widget decides, as against how it looks, is in
`runtime/app/utils/parameterRules.ts` (#166). `@gaas/ui`'s widgets and the
second UI's both render with it: a repeat's instances by position, a
parameter group's bag, the parameters of a conditional's saved case, a
select's options by label and value and the labels its saved value names,
how a boolean reads and is written, and which declared parameters are
offered a widget at all: those the saved bag holds, by name (#167).
`@gaas/ui`'s map from a parameter type to its widget stays in `@gaas/ui`
(ADR 0009), so the second UI has its own:
`playground/components/ParameterWidget.vue`, with one plain widget for each
type `@gaas/ui`'s start form renders. The widgets take their types from
`blendtype`, type-only. This module's own types are written in them, and
`blendtype` resolves as this package's dependency. An analysis cannot add or
remove a repeat's instances, so there is no rule for that, and a
conditional's test parameter is shown and never written (#94).

The second UI's widgets decide three things outside `parameterRules.ts`,
all about how a value is shown:
- `ParameterWidget.vue` shows an `undefined` the way it shows `null`.
- A text widget shows no text for anything but a string, as `@gaas/ui`'s
  `TextToolParameter.vue` does.
- A multiple select reads a saved string as a list of one, as
  `selectOptionLabels` does. `@gaas/ui` hands its menu the saved value
  unchanged.

A number is written as the string typed, which is what Galaxy's own form
sends. `@gaas/ui` writes a number. Galaxy reads either. An emptied box is
sent as `''`, as Galaxy's form and `@gaas/ui`'s float widget send it, and
Galaxy refuses that for a number not declared optional. Rémi chose `''` in
!193's first review round. `@gaas/ui`'s integer widget leaves the parameter
out instead (#187).

A repeat is headed by its title, or by its name when the tool gave none.
Galaxy's form shows the title alone on both releases, so an untitled repeat
reads "1: null" at 26.1. This is the one heading where the second UI departs
from Galaxy's form.

### Supabase Commands
```bash
pnpm supabase:start                         # Start local Supabase
pnpm supabase:stop                          # Stop Supabase
pnpm supabase:status                        # Check status
pnpm supabase:db:reset                      # Reset database
pnpm supabase:migration:new <name>          # Create new migration
pnpm supabase:migration:up                  # Run pending migrations
pnpm supabase:migration:galaxy:create       # Create all Galaxy migrations
pnpm supabase:generate:types                # Generate TypeScript types
```

### Drizzle Commands
```bash
pnpm drizzle:generate                       # Generate migration files
pnpm drizzle:migrate                        # Run migrations
```

### Database Seeding
```bash
# No `db:seed` script exists: the package ships a CLI. It takes a config file
# and reads GALAXY_DRIZZLE_DATABASE_URL from the .env of the directory it runs
# in, so the playground, which keeps the local seed.json, is the usual place.
pnpm exec nuxt-galaxy-seed <config.json> --dry-run   # validate, write nothing
pnpm exec nuxt-galaxy-seed <config.json>             # apply, idempotent
pnpm exec nuxt-galaxy-seed --help                    # every option
```

### Release
```bash
pnpm prepack                                # Build module (dev:prepare + nuxt-module-build)
pnpm release:publish                        # Manual fallback only: the GitHub mirror publishes (root AGENTS.md, ADR 0006)
```

### CLI Binary
```bash
nuxt-galaxy-migrate                         # Run migrations manually
```

## Section 3: Coding Conventions and Patterns

### Module Structure
```
src/
├── module.ts               # Module definition & setup
├── results-views/          # Build time: scans every layer's `app/workflows/`
│                           # into the results-view registry (ADR 0003)
├── runtime/
│   ├── app/
│   │   ├── composables/    # Auto-imported composables
│   │   ├── queries/        # Pinia Colada queries
│   │   └── utils/          # Shared utilities
│   ├── server/
│   │   ├── api/            # API handlers
│   │   ├── lib/migrate.js  # Migration utilities
│   │   ├── middleware/     # Nitro server middleware, registered with
│   │   │                   # `addServerHandler({ middleware: true })` and so
│   │   │                   # run for every request before any route. Today:
│   │   │                   # `galaxyGuard`, which settles who may call each
│   │   │                   # `/api/galaxy/*` endpoint (#99)
│   │   ├── plugins/        # Nitro plugins
│   │   └── utils/          # Server utilities
│   ├── shared/             # The few pure helpers BOTH halves must agree on
│   │                       # byte-for-byte (e.g. the `<toolId>@<version>` key
│   │                       # the endpoint serves under and the composable
│   │                       # looks up with, and Galaxy's own naming of an
│   │                       # input step). No runtime imports, no side effects;
│   │                       # anything with a direction belongs in app/ or
│   │                       # server/. A type-only import from `blendtype` is
│   │                       # fine: it is erased, so it gives the file no
│   │                       # direction and pulls nothing into either bundle
│   └── types/
│       ├── database.ts     # Generated Supabase types
│       └── nuxt-galaxy.ts  # Module types
```

### Results views
The results-view convention lives here, not in `@gaas/ui`, so that an app's
views outlive a swap of the UI layer (ADR 0003's 2026-10-19 amendment, #168).
- `src/results-views/` runs at build time. `setupResultsViews` scans every
  layer and writes the registry to `#build/nuxt-galaxy/results-views.mjs`,
  with its types beside it, under the module's own name as the alias is. In
  development it rescans when a `workflows/` entry is added or removed.
- `matchResultsView` (in `runtime/app/utils`) and `useResultsView` are
  auto-imported. The results page reads the second, and the admin workflows
  page runs the first on the registry it imports.
- `ResultsViewProps` is in `runtime/types/nuxt-galaxy.ts`. The module points
  the `#nuxt-galaxy` alias at that file. A view needs an import because Vue
  resolves a `defineProps` type only through an import in the SFC. The
  alias, rather than the package name, is what a view imports: it is an
  absolute path, so it resolves even where the app cannot resolve
  `nuxt-galaxy` by name. Inside this workspace both resolve, because of
  `shamefully-hoist`.
- `@gaas/ui` keeps the page that hosts a view, the generic results view, and
  `resultsViewReading`, which the admin column uses to read a match as exact,
  fallback or none.
- Tests: the scanner, registry and report are tested in `test/results-views/`
  against `test/fixtures/results-views/`. The match is tested in
  `test/utils/matchResultsView.test.ts`. `test/module/resultsViews.test.ts`
  boots the fixture extending `test/fixtures/results-views-layer/` and reads
  the registry and alias the module produced.

### Module Definition Pattern
```typescript
export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-galaxy',
    configKey: 'galaxy',
    compatibility: { nuxt: '>=4.0.0' },
  },
  moduleDependencies: {
    '@nuxtjs/supabase': {
      version: '^2.0.3',
      defaults: { clientOptions: { db: { schema: 'galaxy' } } },
    },
    '@pinia/nuxt': { version: '^0.11.3' },
    '@pinia/colada-nuxt': { version: '^1.0.1' },
  },
  defaults: {
    url: process.env.GALAXY_URL || 'http://localhost:9000',
    apiKey: process.env.GALAXY_API_KEY || 'fakekey',
    email: process.env.GALAXY_EMAIL || 'admin@example.org',
    databaseUrl: process.env.GALAXY_DRIZZLE_DATABASE_URL || '...',
    runMigrations: false,
  },
  async setup(options, nuxt) {
    // Runtime config
    nuxt.options.runtimeConfig.public.galaxy = { url: options.url }
    nuxt.options.runtimeConfig.galaxy = {
      apiKey: options.apiKey,
      email: options.email,
      drizzle: { databaseUrl: options.databaseUrl }
    }

    // Register composables
    addImports({ name: 'useGalaxyWorkflowDescription', from: resolver.resolve() })
    addImportsDir(resolver.resolve('./runtime/app/queries'))

    // Server API
    addServerHandler({ route: '/api/galaxy/workflows', handler: {} })
    addServerPlugin(resolver.resolve('./runtime/server/plugins/galaxy.server'))

    if (options.runMigrations) {
      addServerPlugin(resolver.resolve('./runtime/server/plugins/migrations.server'))
    }
  }
})
```

### Server API Pattern
```typescript
// runtime/server/api/galaxy/workflows.get.ts
import { getWorkflowsEffect } from 'blendtype'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const workflow = await Effect.runPromise(
    getWorkflowsEffect().pipe(
      Effect.provide(GalaxyFetch.Live),
      Effect.provide(Layer.succeed(BlendTypeConfig, config.galaxy))
    )
  )
  return workflow
})
```

### Route parameters

Measured against h3 1.15.11's router, not assumed (#28):

- On a **matched** route a parameter is never `undefined`. `getRouterParam`
  types it as `string | undefined`, but a request that omits a segment does
  not match the route and never reaches the handler.
- It *can* be the empty string, but only when the parameter is **not the
  final segment**. An empty segment satisfies a middle parameter, so
  `/api/galaxy/workflows//versions` matches with `workflowId === ''`, while
  `/api/db/analyses/` does not match `[analysisId]` at all.

So a falsy parameter is reachable for a middle parameter and unreachable for
a trailing one — and in neither case is returning `undefined` an answer. A
handler that falls off the end sends **200 with an empty body**, which tells
the caller nothing. Refuse instead, with the answer the endpoint already
gives for an id it cannot use:

```typescript
const analysisId = getRouterParam(event, 'analysisId')
const parsed = Number.parseInt(analysisId ?? '', 10)
if (Number.isNaN(parsed)) {
  throw createError({ statusCode: 404, statusMessage: 'Analysis not found' })
}
```

Parsing folds the empty and the unusable case together: `Number.parseInt('')`
and `Number.parseInt('abc')` are both `NaN`, so one check answers both.

### Folding an effect at the handler boundary

`runGalaxyEffect` ends in `Effect.runPromise`, so an effect that fails rejects
the promise and Nitro renders a generic 500. h3 only produces a status when the
handler **throws** `createError` in ordinary async/await — a throw inside
`Effect.gen` is captured as a defect and buried in a `FiberFailure`. So the
failure has to leave the effect as a *value* first, and the handler throws at
the boundary. That is what the fold is, and ADR 0002 has the argument for it.

**Prefer `Effect.exit` over `Effect.either`.** Measured, not assumed (#40):
`Effect.either` recovers the **error channel only**. A defect — a plain `throw`
inside `Effect.gen`, or `Effect.die` — and an interruption are not in that
channel, so they pass straight through the fold. A `TypeError` thrown inside a
folded handler rejects with a `FiberFailureImpl`, never reaches `toHttpError`,
and writes nothing to evlog: the failures most worth seeing are the only ones
that produce no structured event. `Exit<A, E>` is `Either<A, Cause<E>>`, and a
`Cause` carries expected failure, defect and interruption alike.

This is about an **effect's outcome**, not about the data type in general.
`Either` is still the right answer for a two-case value that is not the result
of running an effect.

`toHttpError` takes the `Cause` and decides from it: a named failure gets its
mapped status, a defect anywhere in the cause gets the logged 500, and an
interruption is rethrown unanswered — nobody is left to read a status, and
giving up is not a fault. So a folding handler is this shape:

```typescript
const result = await runGalaxyEffect(event, program.pipe(
  toGalaxyServiceUnavailable,
  Effect.provide(finalLayer),
  Effect.exit,
))

return Exit.match(result, {
  onFailure: cause => toHttpError(event, cause, 'galaxy histories'),
  onSuccess: value => value,
})
```

Hand the whole cause over. No handler reads the failure itself today:
`workflows.post` used to, for the status its 409 carried on the error, until
#70 folded that 409 into `toHttpError`'s typed map. One that ever needs to
reads it with `Cause.failureOption` for that one check and passes the cause on
regardless. Unwrapping it on the way in throws away the reason for reaching
for `Exit`.

### Configuration Options
```typescript
interface ModuleOptions {
  url: string // GALAXY_URL default
  apiKey: string // GALAXY_API_KEY default
  email: string // GALAXY_EMAIL default
  databaseUrl: string // GALAXY_DRIZZLE_DATABASE_URL default
  runMigrations: boolean // false - run on startup
}
```

## Section 4: Testing Rules

### Test Commands
```bash
pnpm test                   # Run all tests
pnpm test:watch             # Watch mode
pnpm --filter . vitest run  # From root
```

### Testing Standards
- **Framework**: Vitest with @nuxt/test-utils
- **Server Testing**: Test Nitro handlers with mock HTTP requests
- **Database**: Use Supabase test containers or migrate test DB
- **Mocking**: Mock `blendtype` functions, don't call real Galaxy API
- **Coverage**: Tracked via @vitest/coverage-v8

### Test File Locations
- Unit: `test/` directory
- API tests: Test files alongside handlers or in `test/server/`
- The playground's pages: `playground/test/`, run by
  `vitest.config.playground.ts`. The Nuxt test environment boots one app per
  configuration, so the playground needs its own, separate from the module
  fixture's. It loads the tracked `playground/.env.test`, whose Supabase
  settings are fake. The URL is on `.invalid`, a domain that never resolves,
  so any request a test fails to fake fails instead of reaching a local
  Supabase. The tests replace the Supabase client with
  `mockNuxtImport('useSupabaseClient', …)` and assert what a page sent.
  The application's own endpoints, such as a workflow's description, the
  Galaxy instance and the start of an analysis, are answered with
  `registerEndpoint`, which matches a path literally. The Colada cache
  outlives a mount, so a test file that reads queries empties it before
  each test.

## Section 5: "Don't Touch" Zones and Permission Boundaries

### Protected Files
1. **src/runtime/types/database.ts** - Generated by Supabase CLI
2. **supabase/migrations/** - Managed by drizzle-kit, edit via SQL
3. **dist/** - Auto-generated by nuxt-module-build
4. **playground/.nuxt/** - Auto-generated, never commit

### Permission Boundaries
- **Server-Only**: Drizzle ORM operations must stay in server/
- **Runtime Config**: Secrets in private config, URLs in public
- **blendtype**: Use through workspace dependency only
- **Database**: Never expose raw SQL to client

### Environment Variables (Required)
```bash
GALAXY_URL=http://localhost:9000
GALAXY_API_KEY=fakekey
GALAXY_EMAIL=admin@example.com
SUPABASE_URL=http://localhost:54321
SUPABASE_KEY=...
GALAXY_DRIZZLE_DATABASE_URL=postgresql://...
```

### Migration Rules
- ALWAYS use `drizzle-kit generate` to create migrations
- NEVER edit files in supabase/migrations/ directly
- Run `supabase:generate:types` after schema changes
- Test migrations with `supabase:db:reset` before committing
- Grant the API roles by hand, in the migration that adds a galaxy table,
  view, sequence or routine: `anon` and `authenticated` get nothing on it by
  default. A table or view gets `SELECT`, plus a write only when the browser
  makes it through the user's session (the sync and the routes write with
  Drizzle or the service role); a routine gets `REVOKE EXECUTE ... FROM
  PUBLIC`, which no default privilege does for you.
  `test/server/db/apiRoles.test.ts` holds the allow-list and fails on a new
  object left out of it, but only against a running `pnpm supabase:start`: CI
  has no database and skips it

<!-- evlog:start -->
## Logging

This project uses [evlog](https://evlog.dev) for structured, request-scoped logging. The authoritative conventions — which surface uses which logger, what context to attach, and how to handle errors — live in [`../../docs/LOGGING-SPEC.md`](../../docs/LOGGING-SPEC.md). Read that document before adding or changing logging.

Quick orientation:
- **Server API routes** use `const log = useLogger(event)` (auto-imported from `evlog`).
- **Client composables and components** use the `log` symbol from `evlog/client` (auto-imported in Nuxt layers; otherwise `import { log } from 'evlog/client'`).
- **Nuxt module lifecycle and build-time diagnostics** use `@nuxt/kit`'s `logger.withTag(...)`.
- **Standalone scripts and scheduled tasks** with no HTTP event use `initLogger` or `createRequestLogger` from `evlog`.
- **Effect programs** use `Effect.log*` / `Effect.logInfo` / `Effect.logError`; these are routed to evlog by the `runGalaxyEffect` / `runTaskEffect` helpers.

**Never log secrets** — passwords, tokens, API keys such as `GALAXY_API_KEY` and Supabase service keys, full card numbers, session JWTs, or user tokens. Redaction is enabled in production, but choosing safe fields is the first line of defense.
<!-- evlog:end -->

`blendtype` is published on its own and never imports evlog. It logs through its
own `BlendTypeLogger` context tag, which `runGalaxyEffect` / `runTaskEffect`
answer with `BlendTypeLoggerEvlogLayer` — so a Galaxy call's logs land on the
same wide event as the handler that made it, with the library's context flat on
the event rather than under `effectAnnotations`.
