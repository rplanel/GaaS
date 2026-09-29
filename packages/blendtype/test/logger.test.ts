import type { CapturedBlendTypeLog } from './fixtures'
import { Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { downloadDatasetStream } from '../src/histories'
import { blendTypeLog, BlendTypeLogger, BlendTypeLoggerDefault } from '../src/logger'
import { createBlendTypeLoggerCaptureLayer, createLogCaptureLayer, createSuccessLayer } from './fixtures'

describe('blendTypeLog without a BlendTypeLogger in context', () => {
  it('falls back to Effect default logger at every level', async () => {
    const logs: string[] = []

    await Effect.gen(function* () {
      yield* blendTypeLog('debug', 'a debug message')
      yield* blendTypeLog('info', 'an info message')
      yield* blendTypeLog('warn', 'a warn message')
      yield* blendTypeLog('error', 'an error message')
    }).pipe(
      Effect.provide(createLogCaptureLayer(logs)),
      Effect.runPromise,
    )

    expect(logs).toEqual([
      '[DEBUG] a debug message',
      '[INFO] an info message',
      '[WARN] a warn message',
      '[ERROR] an error message',
    ])
  })

  it('turns context into Effect log annotations', async () => {
    const logs: string[] = []

    await blendTypeLog('info', 'annotated', { historyId: 'hid', fileSize: 3 }).pipe(
      Effect.provide(createLogCaptureLayer(logs)),
      Effect.runPromise,
    )

    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('[INFO] annotated')
    expect(logs[0]).toContain('historyId="hid"')
    expect(logs[0]).toContain('fileSize=3')
  })
})

describe('blendTypeLoggerDefault layer', () => {
  it('forwards to the Effect default logger when provided explicitly', async () => {
    const logs: string[] = []

    await blendTypeLog('warn', 'explicit default', { a: 1 }).pipe(
      Effect.provide(BlendTypeLoggerDefault),
      Effect.provide(createLogCaptureLayer(logs)),
      Effect.runPromise,
    )

    expect(logs).toEqual(['[WARN] explicit default a=1'])
  })
})

describe('blendTypeLog with a BlendTypeLogger in context', () => {
  it('routes to the provided logger instead of the Effect logger', async () => {
    const logs: string[] = []
    const entries: CapturedBlendTypeLog[] = []

    await Effect.gen(function* () {
      yield* blendTypeLog('info', 'routed', { datasetId: 'did' })
      yield* blendTypeLog('error', 'also routed')
    }).pipe(
      Effect.provide(createBlendTypeLoggerCaptureLayer(entries)),
      Effect.provide(createLogCaptureLayer(logs)),
      Effect.runPromise,
    )

    expect(entries).toEqual([
      { level: 'info', message: 'routed', context: { datasetId: 'did' } },
      { level: 'error', message: 'also routed', context: {} },
    ])
    expect(logs).toEqual([])
  })

  it('is satisfied by any Layer providing the BlendTypeLogger tag', async () => {
    const seen: string[] = []
    const layer = Layer.succeed(BlendTypeLogger, {
      log: (level, message) => Effect.sync(() => { seen.push(`${level}:${message}`) }),
    })

    await blendTypeLog('debug', 'custom').pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(seen).toEqual(['debug:custom'])
  })
})

// The Promise wrappers take the Layer the caller already builds, and `Layer`
// is covariant in what it provides — so merging a logger into it is the
// injection point, without widening a single wrapper signature.
describe('the Promise API', () => {
  it('routes through a logger merged into the layer the caller already passes', async () => {
    const entries: CapturedBlendTypeLog[] = []
    const layer = Layer.merge(
      createSuccessLayer({ file_size: 0, id: 'did', state: 'ok' }),
      createBlendTypeLoggerCaptureLayer(entries),
    )

    const result = await downloadDatasetStream('hid', 'did', layer)

    expect(result).toBeNull()
    expect(entries.map(e => e.message)).toEqual([
      '[downloadDatasetStreamEffect] start',
      '[downloadDatasetStreamEffect] dataset file_size and state',
      '[downloadDatasetStreamEffect] returning null because file_size === 0',
    ])
  })

  it('logs through Effect default logger when the caller passes only a fetch layer', async () => {
    // The wrapper calls `Effect.runPromise` itself, so there is no seam to
    // inject a capture layer through: the console is what a standalone
    // consumer actually sees, so it is what this asserts on.
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const result = await downloadDatasetStream(
        'hid',
        'did',
        createSuccessLayer({ file_size: 0, id: 'did', state: 'ok' }),
      )

      expect(result).toBeNull()
      const written = consoleLog.mock.calls.map(call => call.join(' ')).join('\n')
      expect(written).toContain('[downloadDatasetStreamEffect] start')
    }
    finally {
      consoleLog.mockRestore()
    }
  })
})
