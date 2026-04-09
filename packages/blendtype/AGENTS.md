# AGENTS.md - Blendtype Package Guide

## Section 1: Stack Definition With Exact Versions

| Component | Version | Purpose |
|-----------|---------|---------|
| **TypeScript** | ^5.9.3 (catalog:) | Type safety |
| **Effect-TS** | ^3.19.6 (catalog:) | Functional programming |
| **unbuild** | ^3.6.1 (catalog:) | Bundling (ESM/CJS) |
| **Vitest** | ^4.1.0 (catalog:testing) | Testing |
| **ofetch** | ^1.5.1 (catalog:) | HTTP client |
| **zod** | ^4.3.6 (catalog:) | Schema validation |
| **tus-js-client** | ^4.3.1 (catalog:) | Resumable uploads |

### Build Output
```
dist/
├── index.mjs       # ESM entry
├── index.cjs       # CJS entry
└── index.d.ts      # TypeScript declarations
```

## Section 2: Executable Commands With Full Flags

### Development & Build
```bash
# Build
pnpm build                    # unbuild (ESM/CJS output)
pnpm prepack                 # Build before publish

# Testing
pnpm test                    # Lint + typecheck + coverage
pnpm vitest                  # Run tests
pnpm vitest watch            # Watch mode
cd ../.. && pnpm test -w packages/blendtype

# Quality
pnpm lint                    # ESLint
pnpmtsc --noEmit            # Type check only
```

## Section 3: Coding Conventions and Patterns

### Effect-TS Architecture
All operations return `Effect.Effect<A, E, R>` and must use `Effect.runPromise()`.

### Key Imports
```typescript
import type { $Fetch } from 'ofetch'
import { Console, Context, Data, Effect, Layer } from 'effect'
```

### Service Pattern (Context.Tag)
```typescript
// Galaxy HTTP client as service
export class GalaxyFetch extends Context.Tag('@blendtype/GalaxyFetch')<
  GalaxyFetch,
  ReturnType<typeof $fetch.create>
>() {
  static readonly Live = Layer.effect(GalaxyFetch, Effect.gen(function* () {
    const { apiKey, url } = yield* BlendTypeConfig
    return $fetch.create({
      baseURL: url,
      headers: { 'x-api-key': apiKey },
    })
  }))
}
```

### Error Handling (Data.TaggedError)
```typescript
export class HttpError extends Data.TaggedError('HttpError')<{
  readonly message: string
}>() {}

export class GalaxyServiceUnavailable extends Data.TaggedError(
  'GalaxyServiceUnavailable'
)<{ readonly message: string }>() {}
```

### Dual API Pattern
Every operation has TWO versions:
1. **Effect version** (for composition): `getWorkflowEffect(id): Effect<Workflow, HttpError, GalaxyFetch>`
2. **Promise version** (for convenience): `getWorkflow(id): Promise<Workflow>`

```typescript
// Effect version
export function getWorkflowEffect(workflowId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    return yield* Effect.tryPromise({
      try: () => fetchApi<Workflow>(`api/workflows/${workflowId}`),
      catch: e => new HttpError({ message: String(e) }),
    })
  })
}

// Promise wrapper
export async function getWorkflow(id: string) {
  return initializeConfig().pipe(
    Effect.flatMap(config =>
      getWorkflowEffect(id).pipe(
        Effect.provide(GalaxyFetch.Live),
        Effect.provide(Layer.succeed(BlendTypeConfig, config)),
      ),
    ),
    Effect.runPromise,
  )
}
```

### File Organization
```typescript
// Standard module structure:
// 1. Imports
import { Context, Data, Effect, Layer } from 'effect'
import { BlendTypeConfig } from './config'
import { GalaxyFetch } from './galaxy'

// 2. Error definitions
export class SpecificError extends Data.TaggedError('SpecificError')<{
  readonly message: string
}>() {}

// 3. Type definitions
export interface OperationParams { id: string }

// 4. Effect version
export function operationEffect(params: OperationParams) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch
    return yield* Effect.tryPromise({})
  })
}

// 5. Promise wrapper
export async function operation(params: OperationParams) {
  return initializeConfig().pipe(
    Effect.flatMap(),
    Effect.provide(),
    Effect.runPromise,
  )
}
```

### Module Organization
| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `galaxy.ts` | HTTP service | GalaxyFetch, HttpError, error transformers |
| `config.ts` | Configuration | BlendTypeConfig, initializeGalaxyClient() |
| `tools.ts` | Tool API | getTool(), getToolEffect() |
| `workflows.ts` | Workflows | getWorkflow(), invokeWorkflow() |
| `histories.ts` | Histories | createHistory(), uploadFileToHistory() |
| `datasets.ts` | Datasets | getDataset() |
| `jobs.ts` | Job monitoring | getJob() |
| `invocations.ts` | Invocations | getInvocation() |

## Section 4: Testing Rules

### Test Commands
```bash
pnpm test                              # All tests + coverage
pnpm vitest                             # Quick run
pnpm vitest watch                       # Watch mode
cd ../.. && pnpm test -w packages/blendtype

# Specific file
pnpm vitest run test/tools.test.ts
```

### Testing Pattern
```typescript
import type { $Fetch } from 'ofetch'
import { Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { GalaxyFetch, getWorkflowEffect } from '../src'

function createMockGalaxyFetch<T>(response: T): Layer.Layer<GalaxyFetch> {
  return Layer.succeed(
    GalaxyFetch,
    (async <T>(_url: string) => response as T) as $Fetch,
  )
}

describe('workflows', () => {
  it('should fetch workflow by ID', async () => {
    const mockWorkflow = { id: 'workflow-id', name: 'Test Workflow' }
    const effect = getWorkflowEffect('workflow-id').pipe(
      Effect.provide(createMockGalaxyFetch(mockWorkflow)),
    )

    const result = await Effect.runPromise(effect)
    expect(result).toEqual(mockWorkflow)
  })
})
```

### Testing Standards
- Always mock `GalaxyFetch` - never make real HTTP calls
- Test Effect version, not Promise wrapper
- Use `Layer.succeed()` for dependency injection
- Test both success and error cases

## Section 5: "Don't Touch" Zones and Permission Boundaries

### Protected Files
1. **tsconfig.json** - Build configuration
2. **build.config.ts** - unbuild configuration
3. **dist/** - Auto-generated, never commit
4. **coverage/** - Auto-generated

### Package Boundaries
- **DO**: Write Effect-TS functional code
- **DO**: Provide dual Effect/Promise APIs
- **DO**: Use Context.Tag for dependency injection
- **DO**: Export types from types/ directory
- **DON'T**: Import Nuxt or Node-specific modules
- **DON'T**: Use console.log (use Effect.Console)
- **DON'T**: Mix sync and async without Effect
- **DON'T**: Export untyped JavaScript

### TypeScript Config
- `"strict": true` - All strict checks enabled
- `"moduleResolution": "bundler"`
- `"verbatimModuleSyntax": true` - ESM imports enforced

### Environment Variables
These are configured at the Nuxt module level, not here:
- `GALAXY_URL` - API base URL
- `GALAXY_API_KEY` - Authentication
- `GALAXY_EMAIL` - User email

### Adding New APIs
1. Define type in `src/types/`
2. Create `*Effect()` in appropriate module
3. Create Promise wrapper with initialization
4. Add errors with `Data.TaggedError`
5. Export both versions
6. Write tests with `createMockGalaxyFetch()`
