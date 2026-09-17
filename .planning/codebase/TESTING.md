# Testing Patterns

**Analysis Date:** 2026-08-10

## Test Framework

**Runner:**
- Vitest `^4.1.0` (`catalog:testing` in `pnpm-workspace.yaml`)
- Root config: `vitest.config.ts` — sets `globals: true`, `environment: 'node'`, `pool: 'threads'` (threads pool avoids forks-pool IPC write failures in the dev runtime), and standard excludes (`node_modules`, `dist`, `repos/`, `.nuxt`, `.output`, `coverage`, `*.d.ts`).
- Package-level `vitest.config.ts` files merge over/override the root config (`packages/ui/vitest.config.ts`, `packages/wiki/vitest.config.ts`, `packages/nuxt-galaxy/vitest.config.ts`, `packages/nuxt-galaxy/vitest.config.server.ts`).

**Assertion Library:** Vitest built-in `expect` (with `@vue/test-utils` assertions for components).

**Nuxt Environment:** `@nuxt/test-utils` `^4.0.0` — configs use `defineVitestConfig` from `@nuxt/test-utils/config` instead of `vitest/config`.

**Component Testing:** `@vue/test-utils` `^2.4.6` + `happy-dom` `^20.4.0`.

### Run Commands

```bash
pnpm test                                         # Root: all package tests (+lint+typecheck per pkg)
pnpm --filter ./packages/blendtype test           # Single package
pnpm --filter ./packages/blendtype vitest run --coverage
pnpm vitest run test/tools.test.ts                # Specific file
cd ../.. && pnpm test -w packages/blendtype
```

Per-package `test` scripts vary (see each `package.json`):
- `blendtype.test` = `pnpm lint && pnpm typecheck && vitest run --coverage` (coverage enforced).
- `nuxt-galaxy.test` = `vitest run && vitest run --config vitest.config.server.ts` (client suite then server suite).
- `ui/wiki.test` = `vitest run`.

**Python (gaas-cli):** pytest (per `packages/gaas-cli/AGENTS.md`) — `pytest`, `pytest -v`, `pytest --cov=gaas_cli`. **No test directory exists yet** (see Coverage Gaps).

## Test File Organization

**Location:** Tests live in a package `test/` directory, generally mirroring the `src/` layout. Components are co-located under `test/components/` in `ui`, not next to the `.vue` file.

**Naming:** `<name>.test.ts` (client) and `<name>.test.ts` under `test/server/` (server) in nuxt-galaxy. Integration tests use the `.integration.test.ts` suffix (e.g. `packages/nuxt-galaxy/test/queries/supabase/datasets.integration.test.ts`).

```
packages/blendtype/
  test/
    fixtures.ts                # Shared mock data + layer factories + assert helpers
    workflows.test.ts          # One file per src/*.ts module

packages/nuxt-galaxy/
  test/
    setup.ts                   # Client env: MSW lifecycle + evlog/client mock
    mocks/handlers.ts, mocks/server.ts
    utils/mockSupabase.ts, utils/test-helpers.ts
    server/setup.ts            # Server env: evlog + #imports + #supabase/server mocks
    server/fixtures.ts         # Galaxy/Drizzle/Supabase mock data + layer factories
    fixtures/basic/            # Minimal Nuxt app root used by defineVitestConfig
    server/api/... test.ts     # Handler tests, mirror src/runtime/server/api
    server/utils/grizzle/*.test.ts
    server/db/schema/... test.ts

packages/ui/
  test/components/*.test.ts    # mountSuspended component tests
  test/composables/*.test.ts

packages/wiki/
  test/unit/*.test.ts          # Pure unit tests on app/utils
```

## Test Structure

**Suite Organization** — `describe('module.function')` blocks scoped per exported function, split into `describe('success cases')` and `describe('error cases')`. Tests use `it('should ...')` phrasing. Example: `packages/blendtype/test/workflows.test.ts`.

**Effect test pattern (blendtype / nuxt server)** — run effects inside `Effect.gen`, provide a mock layer, and assert inside the gen; run with `Effect.runPromise`:

```typescript
it('should successfully retrieve a workflow', () =>
  pipe(
    Effect.gen(function* () {
      const workflow = yield* getWorkflowEffect('test-workflow-id')
      expect(workflow).toEqual(mockGalaxyWorkflow)
    }),
    Effect.provide(createSuccessLayer(mockGalaxyWorkflow)),
    Effect.runPromise,
  ))
```

**Failure-test pattern (Effect)** — capture the `Exit` with `Effect.runPromiseExit` and assert via the shared `expectFailure` helper (`packages/blendtype/test/fixtures.ts:328`, duplicated in `packages/nuxt-galaxy/test/server/fixtures.ts:588`):

```typescript
const exit = yield* Effect.exit(getWorkflowEffect('non-existent'))
expectFailure(exit, (error) => {
  expect(error).toBeInstanceOf(WorkflowError)
  expect(error.statusCode).toBe(HTTP_STATUS_CODES.NOT_FOUND)
})
```

**Promise-wrapper tests** use `await getWorkflow(id, layer)` with `await expect(...).rejects.toThrow()` and unwrap Effect's `FiberFailure` via `extractFiberFailure` before checking `_tag`.

**Nuxt client tests** use `mountSuspended` from `@nuxt/test-utils/runtime` (`packages/ui/test/components/VersionBadge.test.ts`):

```typescript
const wrapper = await mountSuspended(VersionBadge, { props: { version: '1.0.0' } })
expect(wrapper.findComponent({ name: 'UBadge' }).props('icon')).toBe('tabler:versions')
```

## Mocking

**Framework:** `vi` from Vitest (`vi.mock`, `vi.fn`). **No MSW for current tests** — though `msw` `^2.12.12` is in the `testing` catalog and `packages/nuxt-galaxy/test/mocks/` retains MSW scaffolding, the test `README.md` explicitly notes **all current tests use direct `globalThis.fetch` mocking**; MSW is kept "for future use."

### Effect Service Mocking (Layer.succeed / Layer.effect)

Mock the `Context.Tag` service instead of the whole module. Shared factories in `packages/blendtype/test/fixtures.ts`:

```typescript
export function createSuccessLayer<T>(response: T): Layer.Layer<GalaxyFetch> {
  return Layer.effect(GalaxyFetch, Effect.sync(() => (async () => response) as unknown as GalaxyFetchService))
}
export function createFailureLayer(error: Error): Layer.Layer<GalaxyFetch> {
  return Layer.succeed(GalaxyFetch, (async () => { throw error }) as unknown as GalaxyFetchService)
}
```

The richer `packages/nuxt-galaxy/test/server/fixtures.ts` adds:
- `createRoutedGalaxyLayer(routes)` — returns different responses per URL substring, supports sequences.
- `create503GalaxyLayer(routes, failingPatterns, opts)` — fails the first N calls matching patterns with a 503, then succeeds (for retry-path tests).
- `createMockDrizzle()` — chainable query-builder mock; use `setResult(value)` to change returns and `mock.select` etc. for call assertions; exposes `layer: Layer.succeed(Drizzle, mock)` (`test/server/fixtures.ts:447`).
- `createMockSupabaseClient(...)` / `createMockServerSupabaseClientLayer(...)` — auth, query, and storage chain mocks.
- `createLogCaptureLayer(messages[])` — captures Effect log output for assertion.

### Module / Auto-import Mocking (Nuxt)

Mock auto-import boundaries at the module level. `packages/nuxt-galaxy/test/server/setup.ts` centralizes global mocks: `vi.mock('evlog', ...)`, `vi.mock('#imports', ...)` (stubbing `useRuntimeConfig`, `createError`, `useLogger`), `vi.mock('#supabase/server', ...)`.

API handler tests mock the Galaxy dependency module directly (`packages/nuxt-galaxy/test/server/api/galaxy/workflows.test.ts`):

```typescript
vi.mock('blendtype', () => ({
  getWorkflowsEffect: vi.fn(() => ({ pipe: () => Effect.succeed(mockWorkflows) })),
  toGalaxyServiceUnavailable: vi.fn(),
  makeGalaxyLayer: vi.fn(() => ({})),
}))
```

The client `test/setup.ts` mocks `evlog/client` to a no-op `log` and wires MSW `server.listen/resetHandlers/close` around the suite.

**What to Mock:**
- `GalaxyFetch` service / Galaxy HTTP calls — never real HTTP.
- Drizzle query builder chains.
- Supabase client (auth/query/storage).
- Nuxt auto-imports (`#imports`, `#supabase/server`).
- `evlog` loggers.

**What NOT to Mock:** pure computation and the Effect structure itself — assert on real `Effect` behavior with mock layers. Unit-test the `*Effect` versions primarily; test Promise wrappers for mapping behavior (503 → `GalaxyServiceUnavailable`).

## Fixtures and Factories

- **Central fixture file per package:** `packages/blendtype/test/fixtures.ts`, `packages/nuxt-galaxy/test/server/fixtures.ts`. Mock data is typed to the real exports (`GalaxyWorkflow`, `GalaxyDataset`, DB row shapes matching Drizzle schema).
- Mock DB rows are named `mockDb*` (`mockDbUser`, `mockDbHistory`, `mockDbWorkflow`, `mockDbAnalysis`, `mockDbJob`) in `packages/nuxt-galaxy/test/server/fixtures.ts`.
- Constants centralize shared strings/status codes: `ERROR_MESSAGES = { NETWORK_REFUSED, TIMEOUT, ... }` and `HTTP_STATUS_CODES = { OK, NOT_FOUND, ... }`.

## Coverage

**Requirements:** Enforced for `blendtype` — its `test` script runs `vitest run --coverage` using `@vitest/coverage-v8` (`packages/blendtype/package.json`). Covered `src/*` reports are generated into `packages/blendtype/coverage/`. No numeric threshold is configured; coverage is run but not gated by a minimum percentage in the configs inspected. Other packages run tests without coverage.

**View Coverage:**
```bash
pnpm --filter ./packages/blendtype vitest run --coverage
```

## Test Types

**Unit Tests:**
- Effect operations (`blendtype`), grizzle DB helpers, pure utils (`wiki/test/unit/utils.test.ts`), query option definitions (`packages/nuxt-galaxy/test/queries/supabase/datasets.test.ts`).

**Integration Tests:**
- Supabase query options against mocked fetch (`.../datasets.integration.test.ts`), sync flow (`test/server/tasks/integration/sync-flow.test.ts`), Grizzle sync helpers against mock Drizzle layers.

**Component Tests:**
- `packages/ui/test/components/*.test.ts` via `mountSuspended` + `@vue/test-utils` (e.g. `VersionBadge.test.ts`, `InvokeForm.test.ts`, `FloatToolParameter.test.ts`).

**E2E / Visual:** **Not implemented.** `playwright-core` `^1.56.1` is in the `testing` catalog and `nuxt-galaxy` devDeps, and the `ui`/`wiki` AGENTS docs reference Playwright visual/E2E testing, but there is **no `playwright.config.*` in the project** (only under vendored `repos/`) and no Playwright test files. The `nuxt-galaxy` and `ui`/`wiki` playgrounds (`.playground/`, `playground/`) serve as manual integration targets.

## Async Testing

Effect tests are naturally async via `Effect.runPromise` / `Effect.runPromiseExit` inside `async` `it` callbacks. Vue component tests use `await mountSuspended(...)` and `flushPromises` (from `@vue/test-utils`, re-exported via `packages/nuxt-galaxy/test/utils/test-helpers.ts`).

## Coverage Gaps

- **`packages/gaas-cli` — no tests present.** There is no `tests/` directory (only vendored `.venv` packages). The pytest conventions in `packages/gaas-cli/AGENTS.md` (CliRunner, `unittest.mock`, `conftest.py`, 80% coverage) are documented but unimplemented. Medium priority — the CLI has no regression safety net.
- **E2E / Playwright — none configured**, despite the dependency being present and docs describing visual/integration testing.
- `docs` package has no tests (content/docs package).

---

*Testing analysis: 2026-08-10*
