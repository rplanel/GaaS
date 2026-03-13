# blendtype

A TypeScript wrapper for the [Galaxy](https://galaxyproject.org/) REST API built on [Effect-TS](https://effect.website/). It provides type-safe, composable, and robust operations for interacting with Galaxy servers, including workflow execution, history management, dataset operations, and TUS resumable file uploads.

## What It Does

**blendtype** wraps the Galaxy REST API in a modern, functional programming style using Effect-TS. Key capabilities include:

- **Workflow Management**: Invoke and monitor Galaxy workflows with type-safe inputs and parameters
- **History Operations**: Create, read, update, and delete Galaxy histories
- **Dataset Operations**: Manage datasets within histories, including downloads
- **TUS Resumable Uploads**: Upload large files to Galaxy with automatic resumable support
- **Tool Discovery**: Query and retrieve Galaxy tool definitions with full parameter information
- **Job Monitoring**: Track the status of Galaxy jobs and invocations
- **Comprehensive Type Safety**: Full TypeScript definitions for all Galaxy REST API responses
- **Robust Error Handling**: Discriminated union errors with context-aware error messages

## Core Principles

### Effect-TS Architecture

All operations return `Effect.Effect<A, E, R>` types that compose seamlessly. Use `Effect.runPromise()` or `Effect.runSync()` to execute effects, or build larger workflows by composing smaller effects.

### Service Pattern

External dependencies (HTTP client, configuration) are modeled as services using `Context.Tag`. Example:

```typescript
// GalaxyFetch service wraps ofetch
export class GalaxyFetch extends Context.Tag('@blendtype/GalaxyFetch')<
  GalaxyFetch,
  ReturnType<typeof $fetch.create>
>() {
  static readonly Live = Layer.effect(GalaxyFetch, /* implementation */)
}
```

### Tagging Error Handling

All errors use `Data.TaggedError` for discriminated unions, enabling precise error matching:

```typescript
export class WorkflowError extends Data.TaggedError('WorkflowError')<{
  readonly message: string
  readonly workflowId: string
  readonly cause?: unknown
}>() {}
```

### Dual API Design

Every operation has two implementations:

1. **Effect version**: Returns `Effect.Effect<A, E, R>` for composition
2. **Promise version**: Returns `Promise<A>` for convenience

Example: `getWorkflowEffect()` and `getWorkflow()`

### Layer-based Dependency Injection

Services are provided via Effect Layers for testability and modularity:

```typescript
// Production
Effect.gen(function* () {
  const result = yield* someOperation()
  return result
}).pipe(Effect.provide(GalaxyFetch.Live))

// Testing
const testLayer = Layer.succeed(GalaxyFetch, mockFetch)
```

## Installation

<!-- automd:pm-install -->

```sh
# ✨ Auto-detect
npx nypm install blendtype

# npm
npm install blendtype

# yarn
yarn add blendtype

# pnpm
pnpm add blendtype

# bun
bun install blendtype

# deno
deno install npm:blendtype
```

<!-- /automd -->

## Usage

### Basic Setup

```typescript
import { BlendTypeConfig, initializeGalaxyClient } from 'blendtype'
import { Effect, Layer } from 'effect'

// Configure the client
const config: BlendTypeConfigService = {
  url: 'https://usegalaxy.org', // Your Galaxy server URL
  apiKey: 'your-api-key-here' // Get from Galaxy user preferences
}

// Create a configuration layer
const configLayer = initializeGalaxyClient(config)
```

### Creating Histories

```typescript
import { createHistory, deleteHistory, getHistory } from 'blendtype'
import { Console, Effect } from 'effect'

// Effect version - for composition
const program = Effect.gen(function* () {
  // Create a new history
  const history = yield* createHistoryEffect('My Analysis')
  yield* Console.log(`Created history: ${history.id}`)

  // Get history details
  const details = yield* getHistoryEffect(history.id)
  yield* Console.log(`History name: ${details.name}`)

  // Delete the history when done
  yield* deleteHistoryEffect(history.id)
  yield* Console.log('History deleted')
})

// Promise version - for direct use
async function manageHistory() {
  const history = await createHistory('My Analysis')
  console.log(`Created: ${history.id}`)

  const details = await getHistory(history.id)
  console.log(`Details: ${details.name}`)

  await deleteHistory(history.id)
}
```

### TUS Resumable File Uploads

```typescript
import { Buffer } from 'node:buffer'
import { uploadFileToHistory } from 'blendtype'

async function uploadData() {
  const buffer = Buffer.from('Your data here...')

  // Upload file to a specific history
  const dataset = await uploadFileToHistory({
    historyId: 'your-history-id',
    blob: buffer,
    name: 'data.txt'
  })

  console.log(`Uploaded: ${dataset.name} with ID ${dataset.id}`)
}
```

### Running Workflows

```typescript
import { getWorkflow, invokeWorkflow } from 'blendtype'
import { Effect } from 'effect'

async function runAnalysis() {
  // Invoke a workflow
  const invocation = await invokeWorkflow(
    'history-id',
    'workflow-id',
    {
      // Input datasets mapped to workflow inputs
      0: { id: 'dataset-1', src: 'hda' }
    },
    {
      // Tool parameters
      'tool-id': {
        'param-name': 'value'
      }
    }
  )

  console.log(`Workflow started: ${invocation.id}`)
}

// Effect version with error handling
const workflowProgram = Effect.gen(function* () {
  const workflow = yield* getWorkflowEffect('workflow-id')
  yield* Effect.log(`Running workflow: ${workflow.name}`)

  const invocation = yield* invokeWorkflowEffect(
    'history-id',
    workflow.id,
    inputs,
    parameters
  )

  return invocation
}).pipe(
  Effect.catchTag('WorkflowError', (error) => {
    return Effect.logError(`Workflow failed: ${error.message}`)
  }),
  Effect.provide(GalaxyFetch.Live),
  Effect.runPromise
)
```

### Error Handling

```typescript
import { GalaxyApiError, WorkflowError } from 'blendtype'
import { Effect } from 'effect'

const safeProgram = Effect.gen(function* () {
  const result = yield* someOperation()
  return result
}).pipe(
  Effect.catchTags({
    WorkflowError: (error) => {
      console.error(`Workflow error for ${error.workflowId}: ${error.message}`)
      return Effect.fail(new Error('Please check workflow configuration'))
    },
    GalaxyApiError: (error) => {
      console.error(`API error: ${error.message}`)
      if (error.statusCode === 403) {
        console.error('Authentication failed - check your API key')
      }
      return Effect.fail(error)
    }
  })
)
```

### Using Effect Composition

```typescript
import { createHistory, invokeWorkflow, uploadFileToHistory } from 'blendtype'
import { Effect, pipe } from 'effect'

// Compose multiple operations into a single effect
const analysisPipeline = pipe(
  Effect.gen(function* () {
    // Create history
    const history = yield* createHistoryEffect('Automated Analysis')

    // Upload input data
    const inputDataset = yield* uploadFileToHistoryEffect({
      historyId: history.id,
      blob: dataBuffer,
      name: 'input.txt'
    })

    // Run workflow
    const invocation = yield* invokeWorkflowEffect(
      history.id,
      workflowId,
      { 0: { id: inputDataset.id, src: 'hda' } },
      {}
    )

    return { history, invocation }
  }),
  Effect.provide(GalaxyFetch.Live),
  Effect.tap(({ invocation }) =>
    Effect.log(`Workflow ${invocation.id} started`)
  )
)

// Execute
const result = await Effect.runPromise(analysisPipeline)
```

## API Overview

**blendtype** exports organized modules for different Galaxy API domains:

| Module | Exports | Description |
|--------|---------|-------------|
| `config` | `initializeGalaxyClient`, `BlendTypeConfig` | Configuration and client initialization |
| `galaxy` | `GalaxyFetch`, `getVersion` | Core HTTP service and utility functions |
| `workflows` | `getWorkflow`, `invokeWorkflow`, `exportWorkflow` | Workflow management |
| `histories` | `createHistory`, `getHistory`, `deleteHistory`, `uploadFileToHistory` | History operations |
| `datasets` | `getDataset`, `fetchDataset` | Dataset retrieval and downloading |
| `tools` | `getTool` | Tool discovery and metadata |
| `jobs` | `getJob` | Job status monitoring |
| `invocations` | `getInvocation` | Workflow invocation tracking |
| `errors` | `WorkflowError`, `HistoryError`, `GalaxyApiError`, etc. | Error types and utilities |
| `types` | Galaxy-specific type definitions | All REST API TypeScript types |

Each module provides both Effect and Promise versions of operations.

### Key Types

- `GalaxyWorkflow` - Workflow definition with inputs and outputs
- `GalaxyHistory` - History metadata and contents
- `GalaxyDataset` - Dataset information and metadata
- `GalaxyTool` - Tool configuration and parameters
- `GalaxyJob` - Job execution status
- `GalaxyInvocation` - Workflow invocation tracking

## Architecture

### Module Organization

```
src/
├── index.ts          # Main exports
├── config.ts         # Configuration and initialization
├── galaxy.ts         # Core HTTP service (GalaxyFetch)
├── workflows.ts      # Workflow operations
├── histories.ts      # History operations + TUS upload
├── datasets.ts       # Dataset operations
├── tools.ts          # Tool operations
├── jobs.ts           # Job monitoring
├── invocations.ts    # Invocation tracking
├── errors.ts         # Error types and utilities
├── helpers.ts        # Utility functions
└── types/            # All Galaxy API TypeScript types
    ├── workflow.ts
    ├── history.ts
    ├── dataset.ts
    └── ...
```

### Effect Patterns

All API operations follow this pattern:

1. **Service Access**: Yield services from context
2. **Effect.tryPromise**: Wrap HTTP calls in Effects
3. **Error Mapping**: Map caught errors to custom tagged errors
4. **Dual Export**: Both `*Effect()` and `*()` Promise versions

See [AGENTS.md](./AGENTS.md) for complete architectural documentation.

## Testing

The test suite uses Vitest with Effect-TS patterns for comprehensive coverage:

```bash
# Run tests with coverage
pnpm test

# Run tests in watch mode
pnpm dev

# Run type checking
pnpm typecheck

# Run linting
pnpm lint
pnpm lint:fix  # Auto-fix issues
```

### Mocking Strategy

Tests use Vitest's `importOriginal` pattern to mock `tus-js-client` while maintaining type safety:

```typescript
vi.mock('tus-js-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tus-js-client')>()
  return {
    ...actual,
    Upload: vi.fn().mockImplementation(/* test mock */)
  }
})
```

## How to Contribute

### Prerequisites

- Node.js (latest LTS version recommended)
- [pnpm](https://pnpm.io/) package manager
- Familiarity with [Effect-TS](https://effect.website/)
- Familiarity with [Galaxy REST API](https://galaxyproject.org/develop/api/)

### Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rplanel/gaas.git
   cd gaas/packages/blendtype
   ```

2. **Enable Corepack** (if not already enabled):
   ```bash
   corepack enable
   ```

3. **Install dependencies**:
   ```bash
   pnpm install
   ```

4. **Run interactive tests**:
   ```bash
   pnpm dev
   ```

### Architecture Guidelines

When contributing, follow these patterns:

1. **Effect Pattern**: Operations should return `Effect.Effect<A, Error, Service>`
   ```typescript
   export function myOperationEffect(id: string) {
     return Effect.gen(function* () {
       const fetchApi = yield* GalaxyFetch
       // ... implementation
     })
   }
   ```

2. **Dual API**: Export both Effect and Promise versions
```typescript
export function myOperationEffect(param: string) { /* ... */ }

export function myOperation(param: string) {
  return myOperationEffect(param).pipe(
    Effect.provide(GalaxyFetch.Live),
    runWithConfig,
    Effect.runPromise
  )
}
```

3. **Tagged Errors**: Use `Data.TaggedError` for all custom errors
   ```typescript
   export class MyOperationError extends Data.TaggedError('MyOperationError')<{
     readonly message: string
     readonly cause?: unknown
   }>() {}
   ```

4. **Service Pattern**: Create services using `Context.Tag`
5. **JSDoc Comments**: Document all public functions with parameters, return types, and error conditions

### Testing Requirements

- All new operations must have tests
- Mock external dependencies (like `tus-js-client`)
- Test both success and error cases
- Test edge cases (empty inputs, invalid IDs, etc.)
- Follow existing test patterns in `test/` directory

### Submitting Changes

1. **Create a branch** for your feature/fix
2. **Write tests** for new functionality
3. **Run the full test suite**: `pnpm test`
4. **Ensure linting passes**: `pnpm lint`
5. **Commit with descriptive messages**
6. **Push and create a Pull Request**

### Bug Reports

Please use [GitHub Issues](https://github.com/rplanel/gaas/issues) to report bugs. Include:

- Steps to reproduce
- Expected vs actual behavior
- Galaxy server version
- blendtype version
- Minimal code example

## Development

<details>
<summary>local development</summary>

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

</details>

## Resources

- [Effect-TS Documentation](https://effect.website/)
- [Galaxy REST API Documentation](https://galaxyproject.org/develop/api/)
- [Package Architecture Guide](./AGENTS.md)
- [TUS Protocol](https://tus.io/)

## License

<!-- automd:contributors license=MIT -->

Published under the [MIT](https://github.com/rplanel/gaas/blob/main/LICENSE) license.
Made by [community](https://github.com/rplanel/gaas/graphs/contributors) 💛
<br><br>
<a href="https://github.com/rplanel/gaas/graphs/contributors">
<img src="https://contrib.rocks/image?repo=rplanel/gaas" />
</a>

<!-- /automd -->

<!-- automd:with-automd -->

---

_🤖 auto updated with [automd](https://automd.unjs.io)_

<!-- /automd -->
