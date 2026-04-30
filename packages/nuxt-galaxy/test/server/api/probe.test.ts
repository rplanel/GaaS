import { describe, expect, it } from 'vitest'
import handler from '../../../src/runtime/server/api/probe.get'

describe('gET /api/probe', () => {
  it('should return "ok"', async () => {
    // The handler is a simple function that returns 'ok'
    const result = await handler({} as any)
    expect(result).toBe('ok')
  })
})
