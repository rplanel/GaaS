import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateFsDrain = vi.hoisted(() => vi.fn(() => vi.fn()))

vi.mock('evlog/fs', () => ({
  createFsDrain: mockCreateFsDrain,
}))

const { registerEvlogFsDrain } = await import('../../../src/runtime/server/utils/evlog-drain')

describe('registerEvlogFsDrain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers createFsDrain on evlog:drain when file logging is enabled', () => {
    const hook = vi.fn()
    const nitroApp = { hooks: { hook } } as any

    registerEvlogFsDrain(nitroApp, { dir: 'logs/test', maxFiles: 3, pretty: true })

    expect(hook).toHaveBeenCalledWith('evlog:drain', expect.any(Function))
    expect(mockCreateFsDrain).toHaveBeenCalledWith({ dir: 'logs/test', maxFiles: 3, pretty: true })
  })
})
