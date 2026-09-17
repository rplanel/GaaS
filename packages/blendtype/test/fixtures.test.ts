import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { createLogCaptureLayer } from './fixtures'

describe('createLogCaptureLayer', () => {
  it('captures log messages at Debug level and above', async () => {
    const logs: string[] = []
    const logLayer = createLogCaptureLayer(logs)

    const program = Effect.gen(function* () {
      yield* Effect.logDebug('debug message')
      yield* Effect.log('info message')
      yield* Effect.logWarning('warning message')
      return 'done'
    })

    const result = await program.pipe(
      Effect.provide(logLayer),
      Effect.runPromise,
    )

    expect(result).toBe('done')
    expect(logs).toHaveLength(3)
    expect(logs.some(l => l.includes('[DEBUG] debug message'))).toBe(true)
    expect(logs.some(l => l.includes('[INFO] info message'))).toBe(true)
    expect(logs.some(l => l.includes('[WARN] warning message'))).toBe(true)
  })

  it('formats annotations as key=value pairs', async () => {
    const logs: string[] = []
    const logLayer = createLogCaptureLayer(logs)

    const program = Effect.gen(function* () {
      yield* Effect.log('annotated message').pipe(
        Effect.annotateLogs({ requestId: 'abc123', userId: '42' }),
      )
      return 'done'
    })

    await program.pipe(
      Effect.provide(logLayer),
      Effect.runPromise,
    )

    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('[INFO] annotated message')
    expect(logs[0]).toMatch(/requestId="abc123"/)
    expect(logs[0]).toMatch(/userId="42"/)
  })

  it('sets minimum log level to Debug so debug messages are captured', async () => {
    const logs: string[] = []
    const logLayer = createLogCaptureLayer(logs)

    const program = Effect.gen(function* () {
      yield* Effect.logDebug('only debug')
      return 'done'
    })

    await program.pipe(
      Effect.provide(logLayer),
      Effect.runPromise,
    )

    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('[DEBUG] only debug')
  })
})
