import { useLogger } from 'evlog'
import { describe, expect, it, vi } from 'vitest'
import handler from '../../../src/runtime/server/api/probe.get'
import { createMockRequestLogger } from '../setup'

describe('gET /api/probe', () => {
  it('should return "ok"', async () => {
    const log = createMockRequestLogger()
    vi.mocked(useLogger).mockReturnValue(log)
    const event = { path: '/api/probe', method: 'GET' } as any
    const result = await handler(event)
    expect(result).toBe('ok')
    expect(log.info).toHaveBeenCalledWith('probe:ok')
  })
})
