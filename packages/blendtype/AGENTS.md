# AGENTS.md - Blendtype Package Guide

## Package Overview

**Blendtype** is a TypeScript library that provides a type-safe wrapper around the Galaxy Project API using Effect-TS for functional, composable, and error-handled operations.

- **Package path**: `packages/blendtype/`
- **Language**: TypeScript (ESNext, strict mode)
- **Output**: Dual ESM/CJS modules via unbuild
- **Testing**: Vitest

---

## Architecture: Effect-TS Patterns

This package is built entirely on Effect-TS. All operations return `Effect.Effect<A, E, R>` types that must be run with `Effect.runPromise()` or similar runners.

### Core Effect-TS Imports

```typescript
import { Console, Context, Data, Effect, Layer } from 'effect'
```

### Key Patterns

#### 1. Service Pattern with Context.Tag

All external dependencies are modeled as services:

```typescript
// From galaxy.ts
export class GalaxyFetch extends Context.Tag('@blendtype/GalaxyFetch')<
  GalaxyFetch,
  ReturnType<typeof $fetch.create>
>() {
  static readonly Live = Layer.effect(
    GalaxyFetch,
    Effect.gen(function* () {
      const { apiKey, url } = yield* BlendTypeConfig
      const fetchInstance = $fetch.create({
        baseURL: url,
        headers: {
          'x-api-key': apiKey,
        },
      })
      return fetchInstance
    }),
  )
}
```

**When adding new services**:

- Extend `Context.Tag` with a unique symbol (e.g., `"@blendtype/ServiceName"`)
- Provide a static `Live` Layer for production use
- Place service definitions in appropriate modules

#### 2. Error Handling with Data.TaggedError

All custom errors use tagged errors for discriminated unions:

```typescript
// Pattern from galaxy.ts
export class HttpError extends Data.TaggedError('HttpError')<{
  readonly message: string
}>() {}

export class GalaxyServiceUnavailable extends Data.TaggedError(
  'GalaxyServiceUnavailable',
)<{
  readonly message: string
}>() {}
```

**When adding new errors**:

- Use `Data.TaggedError("ErrorName")` with a unique tag
- Include a `readonly message: string` property
- Add JSDoc comments explaining when the error occurs

#### 3. Effect.gen for Composable Operations

All API operations use `Effect.gen()` for sequential composition:

```typescript
// Standard pattern used across all modules
export function getWorkflowEffect(workflowId: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch // Get service from context

    const workflow = yield* Effect.tryPromise({
      try: () => fetchApi<GalaxyWorkflow>(`api/workflows/${workflowId}`),
      catch: _caughtError =>
        new HttpError({ message: `Error: ${_caughtError}` }),
    })

    return workflow
  })
}
```

**Key rules**:

- Always `yield*` services from context first
- Wrap Promise-based APIs in `Effect.tryPromise()`
- Type the success return type explicitly
- All errors must be typed in the Effect signature

#### 4. Dual API Design

Every operation has TWO implementations:

1. **Effect version** (for composition): `getWorkflowEffect(id: string): Effect.Effect<GalaxyWorkflow, HttpError, GalaxyFetch>`
2. **Promise version** (for convenience): `getWorkflow(id: string): Promise<GalaxyWorkflow>`

Promise versions are wrappers around Effect versions:

```typescript
// From workflows.ts
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

**When adding new operations**:

1. Create the `*Effect()` function first
2. Create the Promise wrapper that uses `initializeConfig()` and `Effect.runPromise`
3. Export both from the module

#### 5. Layer-based Dependency Injection

Services are provided via Layers:

```typescript
// For production
const program = getWorkflowEffect('id').pipe(
  Effect.provide(GalaxyFetch.Live),
  Effect.provide(configLayer),
)

// For testing
const mockLayer = Layer.succeed(GalaxyFetch, mockFetch)
const testProgram = getWorkflowEffect('id').pipe(Effect.provide(mockLayer))
```

**Global config pattern**:

- `initializeGalaxyClient(config)` - Sets up a global Layer
- `runWithConfig(effect)` - Runs an effect with the global config
- Used by Promise-based APIs automatically

---

## Module Organization

| Module           | Purpose              | Key Exports                                                                |
| ---------------- | -------------------- | -------------------------------------------------------------------------- |
| `galaxy.ts`      | Core HTTP service    | `GalaxyFetch` (Context.Tag), `HttpError`, `getVersion`, error transformers |
| `config.ts`      | Configuration        | `BlendTypeConfig`, `initializeGalaxyClient()`, `runWithConfig()`           |
| `tools.ts`       | Tool API             | `getTool()`, `getToolEffect()`                                             |
| `workflows.ts`   | Workflow operations  | `getWorkflow()`, `invokeWorkflow()`, `exportWorkflow()`                    |
| `histories.ts`   | History management   | `createHistory()`, `deleteHistory()`, `uploadFileToHistory()`              |
| `datasets.ts`    | Dataset operations   | `getDataset()`, `fetchDatasetEffect()`                                     |
| `jobs.ts`        | Job monitoring       | `getJob()`                                                                 |
| `invocations.ts` | Workflow invocations | `getInvocation()`                                                          |
| `errors.ts`      | Error utilities      | `isErrorWithMessage()`, `getStatusCode()`                                  |
| `helpers.ts`     | Utilities            | `delay()` for async delays                                                 |
| `types/`         | TypeScript types     | All Galaxy API type definitions                                            |

---

## Code Conventions

### TypeScript Configuration

From `tsconfig.json`:

- `"target": "ESNext"`
- `"moduleResolution": "bundler"`
- `"strict": true` - All strict checks enabled
- `"verbatimModuleSyntax": true` - Enforces proper ESM imports

### File Structure

```typescript
import type { SomeType } from './types'
// 1. Imports
import { Context, Data, Effect, Layer } from 'effect'

// 2. Error definitions (if any)
export class SpecificError extends Data.TaggedError('SpecificError')<{
  readonly message: string
}>() {}

// 3. Type definitions and interfaces
export interface OperationParams {
  id: string
}

// 4. Effect version
export function operationEffect(params: OperationParams) {
  return Effect.gen(function* () {
    // Implementation
  })
}

// 5. Promise wrapper
export async function operation(params: OperationParams) {
  return initializeConfig().pipe(
    Effect.flatMap(config =>
      operationEffect(params).pipe(
        Effect.provide(GalaxyFetch.Live),
        Effect.provide(Layer.succeed(BlendTypeConfig, config)),
      ),
    ),
    Effect.runPromise,
  )
}
```

### Naming Conventions

- **Effect functions**: `verbNounEffect()` (e.g., `getWorkflowEffect`, `createHistoryEffect`)
- **Promise functions**: `verbNoun()` (e.g., `getWorkflow`, `createHistory`)
- **Services**: PascalCase with descriptive names (e.g., `GalaxyFetch`, `BlendTypeConfig`)
- **Error classes**: PascalCase ending with Error (e.g., `HttpError`, `GalaxyServiceUnavailable`)
- **Tags**: Symbol strings with `@blendtype/` prefix (e.g., `"@blendtype/GalaxyFetch"`)

### JSDoc Comments

Always document:

- Function parameters
- Return types
- Error conditions
- Example usage

```typescript
/**
 * Retrieve a workflow by ID
 * @param workflowId - The UUID of the workflow
 * @returns Effect that resolves to GalaxyWorkflow
 * @throws HttpError if the request fails
 * @throws GalaxyServiceUnavailable if Galaxy is down
 */
export function getWorkflowEffect(workflowId: string) {
  // Implementation
}
```

---

## Testing Patterns

Use Vitest for testing. All tests should mock the `GalaxyFetch` service:

```typescript
import type { $Fetch } from 'ofetch'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { GalaxyFetch, getToolEffect } from '../src'

function createMockGalaxyFetch<T>(response: T): Layer.Layer<GalaxyFetch> {
  return Layer.succeed(
    GalaxyFetch,
    (async <T>(_url: string) => response as T) as $Fetch,
  )
}

describe('tools', () => {
  it('should fetch a tool by ID', async () => {
    const mockTool = { id: 'tool-id', name: 'test-tool' }
    const effect = getToolEffect('tool-id', '1.0.0').pipe(
      Effect.provide(createMockGalaxyFetch(mockTool)),
    )

    const result = await Effect.runPromise(effect)
    expect(result).toEqual(mockTool)
  })
})
```

**Testing best practices**:

- Always mock `GalaxyFetch` - never make real HTTP calls
- Test both success and error cases
- Use Effect's mock Layers for dependency injection
- Test the Effect version, not the Promise wrapper

---

## Build System

- **Bundler**: unbuild (based on rollup)
- **Configuration**: `build.config.ts`
- **Output**: `dist/` with `.mjs`, `.cjs`, and `.d.ts` files

### Development Commands

```bash
cd packages/blendtype

# Build
cd ../.. && npm run build -w packages/blendtype
# or: npx unbuild

# Test
cd ../.. && npm test -w packages/blendtype
# or: npx vitest

# Type check
npx tsc --noEmit
```

### Release

Package publishes automatically via changesets when merged to main branch.

---

## Dependencies

**Runtime (dependencies)**:

- `effect` - Effect-TS core (primary framework)
- `ofetch` - HTTP client (wrapped in Effect)
- `zod` - Schema validation (for workflow types)
- `h3` - H3 framework utilities
- `ufo` - URL utilities
- `dotenv` - Environment variables

**Development**:

- `unbuild` - Build system
- `vitest` - Testing framework
- `typescript` - Type checking

**Important**: Always check if a dependency is already used in the package before adding new ones. Prefer existing utility libraries over new dependencies.

---

## Resources

- **Effect-TS Documentation**: https://effect.website/
- **Galaxy API Documentation**: https://galaxyproject.org/develop/api/
- **Package README**: `./README.md`
- **Test Examples**: `./test/` directory

---

## Quick Reference

### Adding a New API Endpoint

1. Define the response type in `types/`
2. Create `operationEffect()` function in appropriate module
3. Create Promise wrapper `operation()` that uses `initializeConfig()` and `Effect.runPromise`
4. Add error types if needed (using `Data.TaggedError`)
5. Export from `index.ts`
6. Write tests using `createMockGalaxyFetch()` helper

### Common Imports

```typescript
// Type imports
import type { $Fetch } from 'ofetch'

// Essential Effect-TS imports
import { Console, Context, Data, Effect, Layer } from 'effect'
import { BlendTypeConfig, initializeConfig } from './config'

// Service imports
import { GalaxyFetch, HttpError, toGalaxyServiceUnavailable } from './galaxy'
```

### Error Handling Template

```typescript
export class MyOperationError extends Data.TaggedError('MyOperationError')<{
  readonly message: string
}>() {}

export function myOperationEffect(id: string) {
  return Effect.gen(function* () {
    const fetchApi = yield* GalaxyFetch

    return yield* Effect.tryPromise({
      try: () => fetchApi(`/api/endpoint/${id}`),
      catch: error => new MyOperationError({ message: String(error) }),
    })
  })
}

export async function myOperation(id: string) {
  return initializeConfig().pipe(
    Effect.flatMap(config =>
      myOperationEffect(id).pipe(
        Effect.provide(GalaxyFetch.Live),
        Effect.provide(Layer.succeed(BlendTypeConfig, config)),
      ),
    ),
    Effect.runPromise,
  )
}
```
