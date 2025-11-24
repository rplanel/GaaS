import { describe, expect, it } from 'vitest'

describe('database types export', () => {
  it('should export Database type', async () => {
    const types = await import('../dist/runtime/types/database.js')
    expect(types).toBeDefined()
  })

  it('should export types from module entry', async () => {
    const module = await import('../dist/types.d.mts?raw')
    const content = module.default || ''

    // Check that all expected types are exported
    expect(content).toContain('Database')
    expect(content).toContain('Tables')
    expect(content).toContain('TablesInsert')
    expect(content).toContain('TablesUpdate')
    expect(content).toContain('Enums')
    expect(content).toContain('CompositeTypes')
    expect(content).toContain('Json')
  })
})
