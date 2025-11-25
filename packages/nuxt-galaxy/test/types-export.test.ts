import { describe, expect, it } from 'vitest'

describe('database types export', () => {
  it('should export Database type', async () => {
    const types = await import('../dist/runtime/types/database.js')
    expect(types).toBeDefined()
  })

  it('should export database types from module entry', async () => {
    const module = await import('../dist/module.d.mts?raw')
    const content = module.default || ''

    // Check that all expected database types are exported
    expect(content).toContain('Database')
    expect(content).toContain('Tables')
    expect(content).toContain('TablesInsert')
    expect(content).toContain('TablesUpdate')
    expect(content).toContain('Enums')
    expect(content).toContain('CompositeTypes')
    expect(content).toContain('Json')
  })
})

describe('nuxt-galaxy types export', () => {
  it('should export nuxt-galaxy types from module entry', async () => {
    const module = await import('../dist/module.d.mts?raw')
    const content = module.default || ''

    // Check that nuxt-galaxy types are re-exported
    expect(content).toContain('nuxt-galaxy')
  })

  it('should have nuxt-galaxy types defined', async () => {
    const types = await import('../dist/runtime/types/nuxt-galaxy.d.ts?raw')
    const content = types.default || ''

    // Check that nuxt-galaxy types are defined
    expect(content).toContain('RowAnalysis')
    expect(content).toContain('RowWorkflow')
    expect(content).toContain('RowHistory')
    expect(content).toContain('RowAnalysisJob')
    expect(content).toContain('RowUploadedDataset')
    expect(content).toContain('AnalysisDetail')
    expect(content).toContain('AnalysisBody')
    expect(content).toContain('RoleType')
    expect(content).toContain('RolePermission')
  })
})
