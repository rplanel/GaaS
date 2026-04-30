import { describe, expect, it, vi } from 'vitest'

const mockWorkflows = [
  { id: 'wf-1', name: 'Workflow 1' },
  { id: 'wf-2', name: 'Workflow 2' },
]

// Mock blendtype
vi.mock('blendtype', () => ({
  getWorkflows: vi.fn(() => Promise.resolve(mockWorkflows)),
  makeGalaxyLayer: vi.fn(() => ({})),
}))

// Mock the galaxy utility
vi.mock('../../../../src/runtime/server/utils/galaxy', () => ({
  useGalaxyLayer: vi.fn(() => ({})),
}))

describe('gET /api/galaxy/workflows', () => {
  it('should return a list of workflows', async () => {
    const handler = (await import('../../../../src/runtime/server/api/galaxy/workflows.get')).default

    const result = await handler({} as any)

    expect(result).toEqual(mockWorkflows)
  })
})
