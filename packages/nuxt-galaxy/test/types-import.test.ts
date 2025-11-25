import type { Database, Json } from '../src/module'
import { describe, expect, it } from 'vitest'

describe('database types import from module', () => {
  it('should allow using Database type', () => {
    type DB = Database
    const db: Partial<DB> = {}
    expect(db).toBeDefined()
  })

  it('should allow using Tables type with schema', () => {
    type Analysis = Database['galaxy']['Tables']['analyses']['Row']
    type History = Database['galaxy']['Tables']['histories']['Row']

    const analysis: Partial<Analysis> = {
      name: 'Test Analysis',
      state: 'new',
    }
    const history: Partial<History> = {
      name: 'Test History',
    }

    expect(history.name).toBe('Test History')

    expect(analysis.name).toBe('Test Analysis')
  })

  it('should allow using TablesInsert type with schema', () => {
    type AnalysisInsert = Database['galaxy']['Tables']['analyses']['Insert']

    const insert: Partial<AnalysisInsert> = {
      name: 'New Analysis',
      galaxy_id: 'test-id',
    }

    expect(insert.name).toBe('New Analysis')
  })

  it('should allow using Enums type from database', () => {
    type JobState = Database['galaxy']['Enums']['job_state']
    type InvocationState = Database['galaxy']['Enums']['invocation_state']

    const state: JobState = 'queued'
    const invState: InvocationState = 'new'

    expect(state).toBe('queued')
    expect(invState).toBe('new')
  })

  it('should allow using Json type', () => {
    type JsonValue = Json
    const data: JsonValue = { key: 'value', nested: { array: [1, 2, 3] } }

    expect(data).toBeDefined()
  })
})
