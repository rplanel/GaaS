import type { Mock } from 'vitest'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError, GetSupabaseUserError } from '../../../../src/runtime/server/utils/grizzle/supabase'
import {
  deleteVersion,
  DeleteWorkflowError,
  WorkflowNotFoundError,
  WorkflowReferencedError,
} from '../../../../src/runtime/server/utils/grizzle/workflows'
import {
  createMockDrizzle,
  createMockEvent,
  createMockServerSupabaseClaimsLayer,
  createMockServerSupabaseClientLayer,
  expectFailure,
  mockDbWorkflow,
  mockSupabaseUser,
} from '../../fixtures'

// Deleting a version no analysis references (#72, ADR 0004), in its own file
// like `workflows-active.test.ts`, for the same reason: one import list per
// ticket.

// Mock getCurrentUserEffect, as `workflows.test.ts` does: the version is
// looked up under the Galaxy service user before anything is deleted.
vi.mock('../../../../src/runtime/server/utils/grizzle/user', async importOriginal => ({
  ...await importOriginal<typeof import('../../../../src/runtime/server/utils/grizzle/user')>(),
  getCurrentUserEffect: vi.fn(() =>
    Effect.succeed({
      user: { id: 1, email: 'admin@example.org', instanceId: 1, createdAt: new Date('2024-01-01') },
      instance: { id: 1, url: 'https://galaxy.example.com', name: 'Test Galaxy', createdAt: new Date('2024-01-01') },
    }),
  ),
}))

describe('deleteVersion', () => {
  /** The version row as the delete answers it: the row that is gone. */
  const deletedRow = { id: 1, name_key: 'test-workflow', version_key: '1.0', revision: 1, active: true }

  /**
   * The one shared query chain the mock client answers every `.schema()`
   * with, so what the delete was narrowed to can be read back.
   */
  function chainOf(mockClient: ReturnType<typeof createMockServerSupabaseClientLayer>['mockClient']) {
    return mockClient.schema.mock.results[0]!.value as Record<string, Mock>
  }

  /**
   * Runs `deleteVersion` against the version the pre-delete read answers
   * (`found`, none for no such version) and a Supabase client whose delete
   * answers `remove`.
   */
  function run(options: {
    found?: unknown[]
    remove?: { data: unknown, error: unknown }
    claims?: typeof mockSupabaseUser | null
  } = {}) {
    const drizzle = createMockDrizzle()
    drizzle.setResult(options.found ?? [mockDbWorkflow])
    const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer({
      queryResult: options.remove ?? { data: [deletedRow], error: null },
    })
    const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(options.claims === undefined ? mockSupabaseUser : options.claims)

    const exit = deleteVersion(1, createMockEvent()).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(supabaseClaimsLayer),
      Effect.runPromiseExit,
    )
    return { exit, mockClient }
  }

  it('deletes the version the id names, and answers with the row that is gone', async () => {
    const { exit, mockClient } = run()

    expect(await exit).toMatchObject({ _tag: 'Success', value: deletedRow })
    const chain = chainOf(mockClient)
    expect(chain.delete).toHaveBeenCalledTimes(1)
    expect(chain.eq).toHaveBeenCalledWith('id', 1)
  })

  it('refuses a caller with no claims before anything is read', async () => {
    const { exit, mockClient } = run({ claims: null })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(GetSupabaseUserError)
    })
    expect(mockClient.schema).not.toHaveBeenCalled()
  })

  it('fails with a cause a caller can act on when no version carries the id, and deletes nothing', async () => {
    const { exit, mockClient } = run({ found: [] })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(WorkflowNotFoundError)
    })
    expect(mockClient.schema).not.toHaveBeenCalled()
  })

  it('reads the database refusing the delete as a refusal, not a fault', async () => {
    // the delete goes through the caller's own session so that the database,
    // not this server, decides who may delete (the `workflows.delete`
    // permission); its refusal leaves here as a 403
    const { exit } = run({ remove: { data: null, error: { code: '42501', message: 'permission denied for table workflows' } } })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(ForbiddenError)
    })
  })

  it('reads a delete the policy let through no row as the same refusal', async () => {
    // a DELETE policy hides the rows it refuses rather than raising, so a
    // caller without the permission gets zero rows back; the version was
    // read a moment ago, so zero rows can only mean the policy
    const { exit } = run({ remove: { data: [], error: null } })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(ForbiddenError)
    })
  })

  it('reads the foreign key refusing the delete as a version that has analyses, naming it and pointing at retiring', async () => {
    // `analyses.workflow_id` references the version with no ON DELETE clause:
    // the database is the rule that a referenced version stays (ADR 0004),
    // and its refusal is the sentence the administrator reads
    const { exit } = run({ remove: { data: null, error: { code: '23503', message: 'update or delete on table "workflows" violates foreign key constraint "analyses_workflow_id_workflows_id_fkey" on table "analyses"' } } })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(WorkflowReferencedError)
      expect((error as WorkflowReferencedError).message).toBe('Version "1.0" of "test-workflow" has analyses and cannot be deleted; retire it instead.')
    })
  })

  it('fails any other delete error as a fault, cause attached', async () => {
    const { exit } = run({ remove: { data: null, error: { code: 'XX000', message: 'disk on fire' } } })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(DeleteWorkflowError)
      expect((error as DeleteWorkflowError).message).toContain('disk on fire')
    })
  })
})
