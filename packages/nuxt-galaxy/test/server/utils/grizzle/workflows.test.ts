import type { Mock } from 'vitest'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { galaxyUserNotFound, GalaxyUserNotFoundError } from '../../../../src/runtime/server/utils/grizzle/user'
import {
  getWorkflowEffect,
  GetWorkflowError,
  insertWorkflow,
  InvalidWorkflowTagError,
  WorkflowNotFoundError,
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

// Mock getCurrentUserEffect. The module's error classes are kept real so
// `toBeInstanceOf` below compares against the class production throws.
vi.mock('../../../../src/runtime/server/utils/grizzle/user', async importOriginal => ({
  ...await importOriginal<typeof import('../../../../src/runtime/server/utils/grizzle/user')>(),
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

  it('fails with a cause a caller can act on when no workflow is found', async () => {
    // `null` used to come back here as a success, and the one caller answered
    // it with 200 and an empty body. A missing workflow is the only cause on
    // this path the caller can do anything about, so it gets its own tag.
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const exit = await getWorkflowEffect(999).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(WorkflowNotFoundError)
    })
  })

  it('fails rather than resolving with undefined when there is no Galaxy user row', async () => {
    const userModule = await import('../../../../src/runtime/server/utils/grizzle/user')
    const getCurrentUserEffectSpy = userModule.getCurrentUserEffect as ReturnType<typeof vi.fn>
    // the leaf's own answer since #33: it fails for a missing row rather than
    // handing back a `null` for this function to refuse
    getCurrentUserEffectSpy.mockReturnValueOnce(Effect.fail(galaxyUserNotFound('https://galaxy.example.com', 'admin@example.org')))

    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbWorkflow])

    const exit = await getWorkflowEffect(1).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GalaxyUserNotFoundError)
    })
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
  // #33. This function refused the missing row with `GetWorkflowError`, the
  // tag that means "the workflow query failed", so the one grep a reader
  // does when an import breaks found a deployment fault under it. The leaf
  // is run for real here, against an empty user table, so this proves the
  // failure now arrives under its own name rather than that the mock says so.
  it('reports a missing Galaxy user row as itself, not as a workflow read failure', async () => {
    const userModule = await import('../../../../src/runtime/server/utils/grizzle/user')
    const realUserModule = await vi.importActual<typeof userModule>('../../../../src/runtime/server/utils/grizzle/user')
    vi.mocked(userModule.getCurrentUserEffect).mockImplementationOnce(realUserModule.getCurrentUserEffect)

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyWorkflowExport)
    const drizzle = createMockDrizzle()
    drizzle.setResult([]) // no Galaxy user row
    const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer({
      queryResult: { data: [], error: null },
    })
    const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(mockSupabaseUser)

    const exit = await insertWorkflow('galaxy-workflow-1', 'https://galaxy.example.com', 'admin@example.org', createMockEvent()).pipe(
      Effect.provide(galaxyLayer),
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(supabaseClaimsLayer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GalaxyUserNotFoundError)
      expect(error).not.toBeInstanceOf(GetWorkflowError)
    })
    // refused before the insert, as before: nothing reaches the database
    expect(mockClient.schema).not.toHaveBeenCalled()
  })

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

  /**
   * The row `insertWorkflow` handed to Supabase. The mock client answers
   * every `.schema()` with one shared chain, so the first result is it.
   */
  function insertedRow(mockClient: ReturnType<typeof createMockServerSupabaseClientLayer>['mockClient']) {
    const chain = mockClient.schema.mock.results[0]!.value as Record<string, Mock>
    return chain.insert!.mock.calls[0]![0]
  }

  it('stores a name and a version that can name a directory exactly as tagged, case included', async () => {
    // `satelliteFinder` has to reach `name_key` with its capital F: the
    // results view is found by a directory of that exact name (ADR 0003), so
    // nothing may be lowercased or otherwise tidied on the way in
    const galaxyLayer = createMockGalaxyLayer({
      ...mockGalaxyWorkflowExport,
      tags: ['name:satelliteFinder', 'version:0.11'],
    })
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbUser])

    const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer({
      queryResult: { data: [{ id: 1 }], error: null },
    })
    const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(mockSupabaseUser)
    const event = createMockEvent()

    await insertWorkflow('galaxy-workflow-1', 'https://galaxy.example.com', 'admin@example.org', event).pipe(
      Effect.provide(galaxyLayer),
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(supabaseClaimsLayer),
      Effect.runPromise,
    )

    const row = insertedRow(mockClient)
    expect(row).toMatchObject({ name_key: 'satelliteFinder', version_key: '0.11' })
    // the name and the version are the whole identity: no derived slug rides along (ADR 0003)
    expect(row).not.toHaveProperty('workflow_slug')
  })

  /**
   * #66. The export's `version` is not a version and does not start at 1: it
   * is the 0-based index of the latest revision, added to the export by
   * Galaxy's `workflow_to_dict` as `len(stored.workflows) - 1`
   * (`managers/workflows.py:1063`, dev 47c11fe5edbd). A workflow imported
   * from a file and never edited has one revision and exports `0`, and the
   * check refused it as an invalid version.
   */
  describe('the export\'s version, a 0-based revision index', () => {
    it.each([
      ['0, the only revision of an imported workflow', 0],
      ['1, the first save after creating in the editor', 1],
    ])('activates a workflow whose export carries %s and stores it as revision', async (_label, version) => {
      const galaxyLayer = createMockGalaxyLayer({ ...mockGalaxyWorkflowExport, version })
      const drizzle = createMockDrizzle()
      drizzle.setResult([mockDbUser])

      const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer({
        queryResult: { data: [{ id: 1 }], error: null },
      })
      const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(mockSupabaseUser)
      const event = createMockEvent()

      await insertWorkflow('galaxy-workflow-1', 'https://galaxy.example.com', 'admin@example.org', event).pipe(
        Effect.provide(galaxyLayer),
        Effect.provide(drizzle.layer),
        Effect.provide(supabaseClientLayer),
        Effect.provide(supabaseClaimsLayer),
        Effect.runPromise,
      )

      expect(insertedRow(mockClient)).toMatchObject({ revision: version })
    })

    it.each([
      ['a negative number', -1],
      ['a fraction', 1.5],
    ])('refuses %s, calling it the revision index rather than a version', async (_label, version) => {
      // Galaxy cannot produce either, so an export carrying one is not what
      // it claims to be and is refused before anything is written
      const galaxyLayer = createMockGalaxyLayer({ ...mockGalaxyWorkflowExport, version })
      const drizzle = createMockDrizzle()
      drizzle.setResult([mockDbUser])

      const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer()
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
        expect((error as GetWorkflowError).message).toContain('revision index')
        expect((error as GetWorkflowError).message).toContain(String(version))
        // the glossary reserves "Version" for the release tag
        expect((error as GetWorkflowError).message).not.toMatch(/\bVersion\b/)
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })

    it('refuses a numeric string one layer up, in the export schema, before the range is read', async () => {
      // `galaxyWorkflowExportSchema` types `version` as a number, so a string
      // never reaches `insertWorkflow`'s range check: blendtype refuses the
      // export as a whole. Named here so the two layers are read together.
      const galaxyLayer = createMockGalaxyLayer({ ...mockGalaxyWorkflowExport, version: '1' as unknown as number })
      const drizzle = createMockDrizzle()
      drizzle.setResult([mockDbUser])

      const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer()
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
        expect(error).toMatchObject({ _tag: 'WorkflowError' })
        expect((error as { message: string }).message).toContain('Invalid workflow export format')
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })
  })

  it.each([
    ['name', 'nf-core/epitopeprediction', ['name:nf-core/epitopeprediction', 'version:1.0']],
    ['version', '1.0+galaxy1', ['name:epitopeprediction', 'version:1.0+galaxy1']],
  ] as const)('refuses a %s tag value that cannot name a directory, naming the tag and the value', async (tag, value, tags) => {
    // Galaxy accepts both of these: it only strips whitespace from a tag. A
    // path separator or a `+` cannot name the directory a results view lives
    // in, so activation says which tag and which value rather than storing a
    // workflow no view can ever be found for
    const galaxyLayer = createMockGalaxyLayer({ ...mockGalaxyWorkflowExport, tags: [...tags] })
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbUser])

    const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer()
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
      expect(error).toBeInstanceOf(InvalidWorkflowTagError)
      expect(error).toMatchObject({ tag, value })
      expect((error as InvalidWorkflowTagError).message).toContain(`${tag}:`)
      expect((error as InvalidWorkflowTagError).message).toContain(value)
    })
    // refused before anything reached the database
    expect(mockClient.schema).not.toHaveBeenCalled()
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
