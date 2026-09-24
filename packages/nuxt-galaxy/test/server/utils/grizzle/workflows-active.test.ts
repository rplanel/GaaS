import type { Mock } from 'vitest'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError, GetSupabaseUserError } from '../../../../src/runtime/server/utils/grizzle/supabase'
import {
  setVersionActive,
  UpdateWorkflowError,
  WorkflowNotFoundError,
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

// Retiring and making a version active again (#71, ADR 0004). In its own
// file rather than appended to `workflows.test.ts`: that file's import block
// is shared with the ticket that changes `publishVersion`, and two additions
// to one import list are a merge conflict for nothing.

// Mock getCurrentUserEffect, as `workflows.test.ts` does: the version is
// looked up under the Galaxy service user before anything is written.
vi.mock('../../../../src/runtime/server/utils/grizzle/user', async importOriginal => ({
  ...await importOriginal<typeof import('../../../../src/runtime/server/utils/grizzle/user')>(),
  getCurrentUserEffect: vi.fn(() =>
    Effect.succeed({
      user: { id: 1, email: 'admin@example.org', instanceId: 1, createdAt: new Date('2024-01-01') },
      instance: { id: 1, url: 'https://galaxy.example.com', name: 'Test Galaxy', createdAt: new Date('2024-01-01') },
    }),
  ),
}))

describe('setVersionActive', () => {
  /** The version row as the update answers it, `active` as asked. */
  function row(active: boolean) {
    return { id: 1, name_key: 'satelliteFinder', version_key: '0.11', revision: 1, active }
  }

  /**
   * The one shared query chain the mock client answers every `.schema()`
   * with, so what the update was handed and what it was narrowed to can be
   * read back.
   */
  function chainOf(mockClient: ReturnType<typeof createMockServerSupabaseClientLayer>['mockClient']) {
    return mockClient.schema.mock.results[0]!.value as Record<string, Mock>
  }

  /**
   * Runs `setVersionActive` against the version the pre-update read answers
   * (`found`, none for no such version) and a Supabase client whose update
   * answers `update`.
   */
  function run(options: {
    active?: boolean
    found?: unknown[]
    update?: { data: unknown, error: unknown }
    claims?: typeof mockSupabaseUser | null
  } = {}) {
    const active = options.active ?? false
    const drizzle = createMockDrizzle()
    drizzle.setResult(options.found ?? [mockDbWorkflow])
    const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer({
      queryResult: options.update ?? { data: [row(active)], error: null },
    })
    const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(options.claims === undefined ? mockSupabaseUser : options.claims)

    const exit = setVersionActive(1, active, createMockEvent()).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(supabaseClaimsLayer),
      Effect.runPromiseExit,
    )
    return { exit, mockClient }
  }

  it('retires a version: writes active false, nothing else, and answers with the row as written', async () => {
    const { exit, mockClient } = run({ active: false })

    expect(await exit).toMatchObject({ _tag: 'Success', value: row(false) })
    const chain = chainOf(mockClient)
    // `active` is the only column an update may touch (ADR 0004); the grant
    // in the database refuses anything else, and this never asks for it
    expect(chain.update!.mock.calls[0]![0]).toEqual({ active: false })
    expect(chain.eq).toHaveBeenCalledWith('id', 1)
  })

  it('makes a retired version active again the same way', async () => {
    const { exit, mockClient } = run({ active: true })

    expect(await exit).toMatchObject({ _tag: 'Success', value: row(true) })
    expect(chainOf(mockClient).update!.mock.calls[0]![0]).toEqual({ active: true })
  })

  it('refuses a caller with no claims before anything is read', async () => {
    const { exit, mockClient } = run({ claims: null })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(GetSupabaseUserError)
    })
    expect(mockClient.schema).not.toHaveBeenCalled()
  })

  it('fails with a cause a caller can act on when no version carries the id, and writes nothing', async () => {
    const { exit, mockClient } = run({ found: [] })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(WorkflowNotFoundError)
    })
    expect(mockClient.schema).not.toHaveBeenCalled()
  })

  it('reads the database refusing the update as a refusal, not a fault', async () => {
    // the update goes through the caller's own session so that the database,
    // not this server, decides who may retire (the `workflows.update`
    // permission); its refusal leaves here as a 403
    const { exit } = run({ update: { data: null, error: { code: '42501', message: 'permission denied for table workflows' } } })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(ForbiddenError)
    })
  })

  it('reads an update the policy let through no row as the same refusal', async () => {
    // an UPDATE policy hides the rows it refuses rather than raising, so a
    // caller without the permission gets zero rows back; the version was
    // read a moment ago, so zero rows can only mean the policy
    const { exit } = run({ update: { data: [], error: null } })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(ForbiddenError)
    })
  })

  it('fails any other update error as a fault, cause attached', async () => {
    const { exit } = run({ update: { data: null, error: { code: 'XX000', message: 'disk on fire' } } })

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(UpdateWorkflowError)
      expect((error as UpdateWorkflowError).message).toContain('disk on fire')
    })
  })
})
