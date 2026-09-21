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
  mockDrizzleSelectRejects,
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
    drizzle.mock.select.mockImplementation(mockDrizzleSelectRejects(['from', 'where'], new Error('DB error')))

    const exit = await getWorkflowEffect(1).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetWorkflowError)
    })
  })

  it('says why when the uniqueness assumption the query was built on does not hold', async () => {
    // this catch was the one of 32 that dropped its cause, so a broken
    // uniqueness assumption arrived as a bare "Error getting workflow" and
    // the real reason reached nobody
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbWorkflow, mockDbWorkflow])

    const exit = await getWorkflowEffect(1).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect((error as GetWorkflowError).message).toContain('Found non unique')
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
      expect(error).toMatchObject({ _tag: 'ForbiddenError', message: 'Permission denied' })
    })
  })

  it('refuses a caller with no claims rather than resolving with nothing', async () => {
    // the body used to sit in an `if (supabaseClaims)` with no `else`, so this
    // fell off the end of the generator and resolved as a success carrying
    // undefined -- which the endpoint answered with 200 and an empty body
    const galaxyLayer = createMockGalaxyLayer(mockGalaxyWorkflowExport)
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbUser])

    const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer({
      queryResult: { data: null, error: null },
    })
    const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(null)
    const event = createMockEvent()

    const exit = await insertWorkflow('galaxy-workflow-1', 'https://galaxy.example.com', 'admin@example.org', event).pipe(
      Effect.provide(galaxyLayer),
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(supabaseClaimsLayer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toMatchObject({ _tag: 'GetSupabaseUserError' })
    })
    // the insert path opens with .schema('galaxy'), so this proves it was never walked
    expect(mockClient.schema).not.toHaveBeenCalled()
  })
})
