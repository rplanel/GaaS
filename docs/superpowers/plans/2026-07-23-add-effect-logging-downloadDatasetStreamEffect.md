# Add Effect logging to `downloadDatasetStreamEffect` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add observable, context-rich Effect logs to `downloadDatasetStreamEffect` and its call site so you can trace when it runs, what metadata it sees, and how many bytes flow through the returned stream.

**Architecture:** Keep lifecycle logs in `blendtype` so they travel with the function. Keep byte-counting logs in `nuxt-galaxy` at the point where the stream is consumed, because that is where the Effect runtime is available and where stream wrapping is safest. Add a Promise wrapper to `histories.ts` following the existing dual-API pattern.

**Tech Stack:** Effect-TS 3.19.6, Vitest, TypeScript strict, `node:stream` (server-side only).

## Global Constraints

- TypeScript strict mode is enabled in all packages.
- `blendtype` is a pure TypeScript library; it already imports `node:buffer` but should avoid new Node-specific runtime imports where possible.
- `nuxt-galaxy` server utilities may import `node:stream`.
- All operations return `Effect.Effect<A, E, R>` and must use `Effect.runPromise()`.
- Every public operation has a dual Effect/Promise API in `blendtype`.
- Tests must mock `GalaxyFetch`, never make real HTTP calls.

---

## Task 1: Add lifecycle logs to `downloadDatasetStreamEffect`

**Files:**
- Modify: `packages/blendtype/src/histories.ts:393-425`
- Test: `packages/blendtype/test/histories.test.ts:417-494`

**Interfaces:**
- Consumes: `Effect.log`, `Effect.annotateLogs`, `getDatasetEffect`, `fetchApi`, `HistoryError`, `withRetry`.
- Produces: `downloadDatasetStreamEffect` emits Effect log entries with annotations `historyId`, `datasetId`, `function: 'downloadDatasetStreamEffect'`.

- [ ] **Step 1: Add a local `log` helper inside `downloadDatasetStreamEffect`.**

```typescript
const log = (message: string, extra: Record<string, unknown> = {}) =>
  Effect.log(`[downloadDatasetStreamEffect] ${message}`).pipe(
    Effect.annotateLogs({ historyId, datasetId, function: 'downloadDatasetStreamEffect', ...extra }),
  )
```

- [ ] **Step 2: Add lifecycle log points.**

Inside `Effect.gen`:
1. `yield* log('start')` at the top.
2. After `getDatasetEffect` succeeds: `yield* log('got dataset metadata', { file_size: datasetDescription.file_size, state: datasetDescription.state })`.
3. Before returning `null` for zero-byte files: `yield* log('dataset file_size is 0, returning null')`.
4. Before fetching the stream: `yield* log('fetching stream', { url: \`api/histories/${historyId}/contents/${datasetId}/display\` })`.
5. After fetching the stream: `yield* log('stream fetched successfully', { streamType: stream.constructor.name })`.
6. On `getDatasetEffect` failure: log the original error before mapping it to `HistoryError`.
7. On stream fetch failure: log the original error before mapping it to `HistoryError`.

- [ ] **Step 3: Update `downloadDatasetStreamEffect` tests to capture and assert logs.**

Use `createLogCaptureLayer` from Task 2. Assert that each existing test case emits the expected lifecycle log messages.

- [ ] **Step 4: Run blendtype tests.**

```bash
pnpm --filter ./packages/blendtype test
```

Expected: all tests pass, including new log assertions.

- [ ] **Step 5: Commit.**

```bash
git add packages/blendtype/src/histories.ts packages/blendtype/test/histories.test.ts
git commit -m "feat(blendtype): add Effect lifecycle logs to downloadDatasetStreamEffect"
```

---

## Task 2: Add a reusable log-capture test helper

**Files:**
- Modify: `packages/blendtype/test/fixtures.ts`

**Interfaces:**
- Produces: `createLogCaptureLayer(messages: string[]): Layer.Layer<never>`.

- [ ] **Step 1: Implement `createLogCaptureLayer`.**

```typescript
import { Effect, HashMap, Layer, Logger, LogLevel } from 'effect'

export function createLogCaptureLayer(messages: string[]): Layer.Layer<never> {
  const logger = Logger.make(({ logLevel, message, annotations }) => {
    const annotationString = HashMap.toEntries(annotations)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ')
    messages.push(`[${logLevel.label}] ${message}${annotationString ? ` ${annotationString}` : ''}`)
  })
  return Layer.merge(
    Logger.replace(Logger.defaultLogger, logger),
    Logger.minimumLogLevel(LogLevel.Debug),
  )
}
```

- [ ] **Step 2: Run blendtype tests to ensure the helper compiles.**

```bash
pnpm --filter ./packages/blendtype test
```

Expected: tests pass.

- [ ] **Step 3: Commit.**

```bash
git add packages/blendtype/test/fixtures.ts
git commit -m "test(blendtype): add createLogCaptureLayer test helper"
```

---

## Task 3: Add a Promise wrapper `downloadDatasetStream`

**Files:**
- Modify: `packages/blendtype/src/histories.ts`
- Test: `packages/blendtype/test/histories.test.ts`

**Interfaces:**
- Consumes: `downloadDatasetStreamEffect`, `toGalaxyServiceUnavailable`, `Effect.provide`, `Effect.runPromise`.
- Produces: `downloadDatasetStream(historyId: string, datasetId: string, layer: Layer.Layer<GalaxyFetch>): Promise<ReadableStream<Uint8Array> | NodeJS.ReadableStream | null>`.

- [ ] **Step 1: Add the Promise wrapper after `downloadDataset`.**

```typescript
export function downloadDatasetStream(
  historyId: string,
  datasetId: string,
  layer: Layer.Layer<GalaxyFetch>,
) {
  return downloadDatasetStreamEffect(historyId, datasetId).pipe(
    toGalaxyServiceUnavailable,
    Effect.provide(layer),
    Effect.runPromise,
  )
}
```

- [ ] **Step 2: Add a test for the Promise wrapper.**

Verify it resolves with `null` for a zero-byte dataset and resolves with a stream for a non-empty dataset.

- [ ] **Step 3: Run blendtype tests.**

```bash
pnpm --filter ./packages/blendtype test
```

Expected: tests pass.

- [ ] **Step 4: Commit.**

```bash
git add packages/blendtype/src/histories.ts packages/blendtype/test/histories.test.ts
git commit -m "feat(blendtype): add downloadDatasetStream Promise wrapper"
```

---

## Task 4: Add context logs at the call site

**Files:**
- Modify: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts:88-98`
- Test: `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts`

**Interfaces:**
- Consumes: `Effect.log`, `Effect.annotateLogs`, `bt.downloadDatasetStreamEffect`, `Effect.runtime`.
- Produces: call-site logs annotated with `context: 'sync-output'`, `analysisId`, `jobId`, `historyId`, `datasetId`.

- [ ] **Step 1: Log before and after calling `downloadDatasetStreamEffect`.**

Inside `syncOutputDatasetEffect`, around line 88:

```typescript
yield* Effect.log('[sync-output] calling downloadDatasetStreamEffect').pipe(
  Effect.annotateLogs({ context: 'sync-output', analysisId, jobId, historyId: historyGalaxyId, datasetId: galaxyDatasetId }),
)

const runtime = yield* Effect.runtime()
const stream = yield* bt.downloadDatasetStreamEffect(historyGalaxyId, galaxyDatasetId).pipe(
  Effect.mapError(error =>
    new SyncOutputError({
      message: `Failed to download dataset stream from Galaxy: ${error instanceof Error ? error.message : String(error)}`,
    }),
  ),
  Effect.provide(galaxyLayer),
)

yield* Effect.log(`[sync-output] downloadDatasetStreamEffect returned ${stream === null ? 'null' : 'stream'}`).pipe(
  Effect.annotateLogs({ context: 'sync-output', analysisId, jobId, historyId: historyGalaxyId, datasetId: galaxyDatasetId }),
)
```

- [ ] **Step 2: Update `output.test.ts` to assert the new context logs.**

Add a log-capture layer and assert the two call-site log messages are emitted in the terminal-ok test.

- [ ] **Step 3: Run nuxt-galaxy tests.**

```bash
pnpm --filter ./packages/nuxt-galaxy test
```

Expected: tests pass.

- [ ] **Step 4: Commit.**

```bash
git add packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts
git commit -m "feat(nuxt-galaxy): add context logs around downloadDatasetStreamEffect call"
```

---

## Task 5: Add byte-counting stream logger

**Files:**
- Create: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/stream-log.ts`
- Modify: `packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts`
- Test: `packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts`

**Interfaces:**
- Consumes: `ReadableStream<Uint8Array>` or `NodeJS.ReadableStream`, `Runtime.Runtime<never>`, `historyId`, `datasetId`.
- Produces: a passthrough stream of the same type that emits Effect log entries for each chunk and on end/error.

- [ ] **Step 1: Implement `logStreamBytes`.**

```typescript
import { Effect, Runtime } from 'effect'
import { PassThrough } from 'node:stream'

export function logStreamBytes(
  stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  runtime: Runtime.Runtime<never>,
  historyId: string,
  datasetId: string,
): ReadableStream<Uint8Array> | NodeJS.ReadableStream {
  const log = (message: string, extra: Record<string, unknown> = {}) =>
    Runtime.runSync(runtime)(
      Effect.log(`[sync-output] ${message}`).pipe(
        Effect.annotateLogs({ context: 'sync-output', historyId, datasetId, ...extra }),
      ),
    )

  if (stream instanceof ReadableStream) {
    let totalBytes = 0
    return new ReadableStream({
      start(controller) {
        const reader = stream.getReader()
        const pump = () =>
          reader.read().then(({ done, value }) => {
            if (done) {
              log('stream finished', { totalBytes })
              controller.close()
              return
            }
            totalBytes += value.byteLength
            log('stream chunk', { chunkBytes: value.byteLength, totalBytes })
            controller.enqueue(value)
            pump()
          }, (error) => {
            log('stream error', { error: error instanceof Error ? error.message : String(error) })
            controller.error(error)
          })
        pump()
      },
    })
  }

  const pass = new PassThrough()
  let totalBytes = 0
  stream.on('data', (chunk: Buffer) => {
    totalBytes += chunk.length
    log('stream chunk', { chunkBytes: chunk.length, totalBytes })
  })
  stream.on('end', () => log('stream finished', { totalBytes }))
  stream.on('error', (error) => log('stream error', { error: error.message }))
  stream.pipe(pass)
  return pass
}
```

- [ ] **Step 2: Wrap the stream returned by `downloadDatasetStreamEffect`.**

In `output.ts`, replace the raw `stream` with `logStreamBytes(stream, runtime, historyGalaxyId, galaxyDatasetId)` before passing it to `uploadStreamToStorage`.

- [ ] **Step 3: Update `output.test.ts`.**

In the terminal-ok test, consume the wrapped stream that was passed to `mockStorageUpload`, then assert that log messages include `stream chunk` and `stream finished` with the correct total byte count.

- [ ] **Step 4: Run nuxt-galaxy tests.**

```bash
pnpm --filter ./packages/nuxt-galaxy test
```

Expected: tests pass.

- [ ] **Step 5: Commit.**

```bash
git add packages/nuxt-galaxy/src/runtime/server/utils/grizzle/stream-log.ts packages/nuxt-galaxy/src/runtime/server/utils/grizzle/sync/output.ts packages/nuxt-galaxy/test/server/utils/grizzle/sync/output.test.ts
git commit -m "feat(nuxt-galaxy): log bytes flowing through downloaded dataset stream"
```

---

## Task 6: Verify everything end-to-end

- [ ] **Step 1: Run the full lint/typecheck/test cycle.**

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: no lint or type errors; all tests pass.

- [ ] **Step 2: Review the git log.**

```bash
git log --oneline -10
```

Expected: four clean commits on top of the base branch.

- [ ] **Step 3: Mark the plan complete.**

No file change needed; record completion in the progress ledger.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-23-add-effect-logging-downloadDatasetStreamEffect.md`.

**Execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session manually.

Choose an option to proceed.
