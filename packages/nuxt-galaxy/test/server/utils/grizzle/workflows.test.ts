import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import {
  getWorkflowEffect,
  GetWorkflowError,
  insertWorkflow,
} from '../../../../src/runtime/server/utils/grizzle/workflows'
import {
  createMockDrizzle,
  createMockEvent,
  createMockGalaxyLayer,
  createMockServerSupabaseClaimsLayer,
  createMockServerSupabaseClientLayer,
  expectFailure,
  mockDbUser,
  mockDbWorkflow,
  mockGalaxyWorkflowExport,
  mockSupabaseUser,
} from '../../fixtures'

// Mock getCurrentUserEffect
vi.mock('../../../../src/runtime/server/utils/grizzle/user', () => ({
  getCurrentUserEffect: vi.fn(() =>
    Effect.succeed({
      user: { id: 1, email: 'admin@example.org', instanceId: 1, createdAt: new Date('2024-01-01') },
      instance: { id: 1, url: 'https://galaxy.example.com', name: 'Test Galaxy', createdAt: new Date('2024-01-01') },
    }),
  ),
}))

describe('getWorkflowEffect', () => {
  it('should return a workflow when found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbWorkflow])

    const result = await getWorkflowEffect(1).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(mockDbWorkflow)
  })

  it('should return null when no workflow is found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getWorkflowEffect(999).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })

  it('should fail with GetWorkflowError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.where = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('DB error')).catch(reject)
      return chain
    })

    const exit = await getWorkflowEffect(1).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetWorkflowError)
    })
  })
})

describe('insertWorkflow', () => {
  it('should export workflow from Galaxy and insert via Supabase', async () => {
    const galaxyLayer = createMockGalaxyLayer(mockGalaxyWorkflowExport)
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbUser])

    const insertedData = [{ id: 1, name: 'Test Workflow', galaxy_id: 'galaxy-workflow-1' }]
    const { layer: supabaseClientLayer } = createMockServerSupabaseClientLayer({
      queryResult: { data: insertedData, error: null },
    })
    const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(mockSupabaseUser)

    const event = createMockEvent()

    const result = await insertWorkflow('galaxy-workflow-1', 'https://galaxy.example.com', 'admin@example.org', event).pipe(
      Effect.provide(galaxyLayer),
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(supabaseClaimsLayer),
      Effect.runPromise,
    )

    expect(result).toEqual(insertedData)
  })

  it('should fail when workflow has no version tag', async () => {
    const exportWithoutVersionTag = {
      ...mockGalaxyWorkflowExport,
      tags: ['name:test-workflow'], // no version tag
    }
    const galaxyLayer = createMockGalaxyLayer(exportWithoutVersionTag)
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbUser])

    const { layer: supabaseClientLayer } = createMockServerSupabaseClientLayer()
    const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(mockSupabaseUser)
    const event = createMockEvent()

    const exit = await insertWorkflow('galaxy-workflow-1', 'https://galaxy.example.com', 'admin@example.org', event).pipe(
      Effect.provide(galaxyLayer),
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(supabaseClaimsLayer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetWorkflowError)
      expect((error as GetWorkflowError).message).toContain('Workflow is missing a version tag')
    })
  })

  it('should fail when workflow has no name tag', async () => {
    const exportWithoutNameTag = {
      ...mockGalaxyWorkflowExport,
      tags: ['version:1.0'], // no name tag
    }
    const galaxyLayer = createMockGalaxyLayer(exportWithoutNameTag)
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbUser])

    const { layer: supabaseClientLayer } = createMockServerSupabaseClientLayer()
    const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(mockSupabaseUser)
    const event = createMockEvent()

    const exit = await insertWorkflow('galaxy-workflow-1', 'https://galaxy.example.com', 'admin@example.org', event).pipe(
      Effect.provide(galaxyLayer),
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(supabaseClaimsLayer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetWorkflowError)
      expect((error as GetWorkflowError).message).toContain('Workflow is missing a name tag')
    })
  })

  it('should fail with permission denied on 42501 error code', async () => {
    const galaxyLayer = createMockGalaxyLayer(mockGalaxyWorkflowExport)
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbUser])

    const { layer: supabaseClientLayer } = createMockServerSupabaseClientLayer({
      queryResult: { data: null, error: { message: 'Permission denied', code: '42501' } },
    })
    const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(mockSupabaseUser)
    const event = createMockEvent()

    const exit = await insertWorkflow('galaxy-workflow-1', 'https://galaxy.example.com', 'admin@example.org', event).pipe(
      Effect.provide(galaxyLayer),
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(supabaseClaimsLayer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect((error as Error).message).toContain('Permission denied')
    })
  })
})
