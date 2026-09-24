import type { Mock } from 'vitest'
import type { PublishVersionBody } from '../../../../src/runtime/server/utils/publishBody'
import { Effect, Exit } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { galaxyUserNotFound, GalaxyUserNotFoundError } from '../../../../src/runtime/server/utils/grizzle/user'
import {
  ConcurrentPublishError,
  getWorkflowEffect,
  GetWorkflowError,
  publishVersion,
  RevisionAlreadyPublishedError,
  VersionLabelTakenError,
  WorkflowNameLockedError,
  WorkflowNotFoundError,
} from '../../../../src/runtime/server/utils/grizzle/workflows'
import {
  createMockDrizzle,
  createMockEvent,
  createMockGalaxyLayer,
  createMockServerSupabaseClaimsLayer,
  createMockServerSupabaseClientLayer,
  createRecordingGalaxyLayer,
  expectFailure,
  expectFailureOf,
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

/**
 * Publishing (ADR 0004): one version row per label, pinned to the revision
 * the export carries, with nothing copied in Galaxy. Every refusal below is a
 * sentence the administrator reads in the publish dialog, and nothing reaches
 * the database before the last check, which is the database's own.
 */
describe('publishVersion', () => {
  /** What the dialog sends: the stored workflow, the lineage name and the label. */
  const body: PublishVersionBody = { galaxyId: 'galaxy-workflow-1', name: 'satelliteFinder', label: '0.11' }

  /** A version already published, as the one query before the insert reads it. */
  function version(overrides: Partial<{ id: number, galaxyId: string, userId: number, nameKey: string, versionKey: string, revision: number }> = {}) {
    return { id: 7, galaxyId: 'galaxy-workflow-1', userId: 1, nameKey: 'satelliteFinder', versionKey: '0.10', revision: 0, ...overrides }
  }

  /**
   * The row publishing handed to Supabase. The mock client answers every
   * `.schema()` with one shared chain, so the first result is it.
   */
  function insertedRow(mockClient: ReturnType<typeof createMockServerSupabaseClientLayer>['mockClient']) {
    const chain = mockClient.schema.mock.results[0]!.value as Record<string, Mock>
    return chain.insert!.mock.calls[0]![0]
  }

  /**
   * Runs `publishVersion` against an export, the versions already published
   * (what the pre-insert query answers) and a Supabase client whose insert
   * answers `insert`.
   */
  function publish(options: {
    body?: PublishVersionBody
    galaxyExport?: unknown
    published?: ReturnType<typeof version>[]
    insert?: { data: unknown, error: unknown }
    claims?: typeof mockSupabaseUser | null
  } = {}) {
    const galaxyLayer = createMockGalaxyLayer(options.galaxyExport ?? mockGalaxyWorkflowExport)
    const drizzle = createMockDrizzle()
    drizzle.setResult(options.published ?? [])
    const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer({
      queryResult: options.insert ?? { data: { id: 1 }, error: null },
    })
    const supabaseClaimsLayer = createMockServerSupabaseClaimsLayer(options.claims === undefined ? mockSupabaseUser : options.claims)

    const exit = publishVersion(options.body ?? body, 'https://galaxy.example.com', 'admin@example.org', createMockEvent()).pipe(
      Effect.provide(galaxyLayer),
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(supabaseClaimsLayer),
      Effect.runPromiseExit,
    )
    return { exit, mockClient, drizzle }
  }

  // #33. The leaf is run for real here, against an empty user table, so this
  // proves the failure arrives under its own name rather than that the mock
  // says so.
  it('reports a missing Galaxy user row as itself, not as a workflow read failure', async () => {
    const userModule = await import('../../../../src/runtime/server/utils/grizzle/user')
    const realUserModule = await vi.importActual<typeof userModule>('../../../../src/runtime/server/utils/grizzle/user')
    vi.mocked(userModule.getCurrentUserEffect).mockImplementationOnce(realUserModule.getCurrentUserEffect)

    const { exit, mockClient } = publish({ published: [] }) // no Galaxy user row either

    expectFailure(await exit, (error) => {
      expect(error).toBeInstanceOf(GalaxyUserNotFoundError)
      expect(error).not.toBeInstanceOf(GetWorkflowError)
    })
    // refused before the insert, as before: nothing reaches the database
    expect(mockClient.schema).not.toHaveBeenCalled()
  })

  it('publishes the latest revision of an untagged stored workflow under the typed name and label', async () => {
    // Tags used to be the identity and a workflow without both was refused;
    // they are now at most a pre-fill in the dialog, so nothing here reads them
    const galaxyExport = { ...mockGalaxyWorkflowExport, tags: [], version: 3, uuid: '2f169fa2-3466-4de9-9e3c-d64d4850340f' }
    const inserted = { id: 1, name_key: 'satelliteFinder', version_key: '0.11' }

    const { exit, mockClient } = publish({ galaxyExport, insert: { data: inserted, error: null } })

    expect(await exit).toEqual(Exit.succeed(inserted))
    // the row is exactly this: the stored workflow, the revision by index and
    // by uuid, the snapshot, who published, and the two names as typed with
    // their case (ADR 0003); `published_at` and `active` are the database's
    expect(insertedRow(mockClient)).toEqual({
      galaxy_id: 'galaxy-workflow-1',
      revision: 3,
      revision_uuid: '2f169fa2-3466-4de9-9e3c-d64d4850340f',
      name_key: 'satelliteFinder',
      version_key: '0.11',
      name: galaxyExport.name,
      user_id: mockDbUser.user.id,
      definition: galaxyExport,
      published_by: mockSupabaseUser.id,
    })
  })

  it('publishes a second label for the same stored workflow and copies nothing in Galaxy', async () => {
    // one revision is already published as 0.10; a later save is published as
    // 0.11 under the same name. Galaxy is only ever asked for the export: no
    // copy, no tag written, no write of any kind
    const galaxy = createRecordingGalaxyLayer(() => ({ ...mockGalaxyWorkflowExport, version: 1 }))
    const drizzle = createMockDrizzle()
    drizzle.setResult([version({ versionKey: '0.10', revision: 0 })])
    const { layer: supabaseClientLayer, mockClient } = createMockServerSupabaseClientLayer({
      queryResult: { data: { id: 2 }, error: null },
    })

    const exit = await publishVersion(body, 'https://galaxy.example.com', 'admin@example.org', createMockEvent()).pipe(
      Effect.provide(galaxy.layer),
      Effect.provide(drizzle.layer),
      Effect.provide(supabaseClientLayer),
      Effect.provide(createMockServerSupabaseClaimsLayer(mockSupabaseUser)),
      Effect.runPromiseExit,
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(insertedRow(mockClient)).toMatchObject({ name_key: 'satelliteFinder', version_key: '0.11', revision: 1 })
    expect(galaxy.calls).toEqual([{ method: 'GET', url: 'api/workflows/galaxy-workflow-1/download?style=export' }])
  })

  describe('the refusals, in the order the dialog reads them', () => {
    it('refuses a label already used for this name, naming both', async () => {
      // the (name, label) pair is app-wide: it names the results view
      // directory, whichever stored workflow carries the name (ADR 0004)
      const { exit, mockClient } = publish({
        published: [version({ galaxyId: 'another-stored-workflow', nameKey: 'satelliteFinder', versionKey: '0.11' })],
      })

      expectFailureOf(await exit, VersionLabelTakenError, (error) => {
        expect(error.message).toBe('Version "0.11" of "satelliteFinder" already exists.')
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })

    it('refuses a revision already published for this stored workflow, naming its label', async () => {
      const { exit, mockClient } = publish({
        galaxyExport: { ...mockGalaxyWorkflowExport, version: 1 },
        published: [version({ versionKey: '0.10', revision: 1 })],
      })

      expectFailureOf(await exit, RevisionAlreadyPublishedError, (error) => {
        expect(error.message).toBe('Revision 1 is already published as version "0.10" of "satelliteFinder".')
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })

    it('refuses a name that differs from the one this stored workflow already carries', async () => {
      // a stored workflow keeps one name once it has a version: the name is
      // the lineage, and the dialog locks it (ADR 0004)
      const { exit, mockClient } = publish({
        body: { ...body, name: 'defenseFinder', label: '1.0' },
        galaxyExport: { ...mockGalaxyWorkflowExport, version: 1 },
        published: [version({ nameKey: 'satelliteFinder', versionKey: '0.10', revision: 0 })],
      })

      expectFailureOf(await exit, WorkflowNameLockedError, (error) => {
        expect(error.message).toBe('This workflow is published as "satelliteFinder"; a new version keeps that name.')
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })

    it('does not count a version of another stored workflow as this one\'s lineage or revision', async () => {
      // the control for the two refusals above: the same name and revision
      // on another stored workflow (a name may span stored workflows) refuse
      // nothing, and another instance's row with the same Galaxy id is not
      // this stored workflow either, since `user_id` names the instance
      const { exit } = publish({
        galaxyExport: { ...mockGalaxyWorkflowExport, version: 1 },
        published: [
          version({ galaxyId: 'another-stored-workflow', nameKey: 'satelliteFinder', versionKey: '0.10', revision: 1 }),
          version({ userId: 2, nameKey: 'defenseFinder', versionKey: '0.11', revision: 1 }),
        ],
      })

      expect(Exit.isSuccess(await exit)).toBe(true)
    })

    it('answers the label before the revision, and the revision before the name', async () => {
      const bothLabelAndRevision = publish({
        galaxyExport: { ...mockGalaxyWorkflowExport, version: 1 },
        published: [version({ versionKey: '0.11', revision: 1 })],
      })
      expectFailure(await bothLabelAndRevision.exit, error => expect(error).toBeInstanceOf(VersionLabelTakenError))

      const bothRevisionAndName = publish({
        body: { ...body, name: 'defenseFinder' },
        galaxyExport: { ...mockGalaxyWorkflowExport, version: 1 },
        published: [version({ nameKey: 'satelliteFinder', versionKey: '0.10', revision: 1 })],
      })
      expectFailure(await bothRevisionAndName.exit, error => expect(error).toBeInstanceOf(RevisionAlreadyPublishedError))
    })

    it('leaves the permission check to the database, as the last one, and reads its refusal as a 403', async () => {
      const { exit } = publish({
        insert: { data: null, error: { message: 'Permission denied', code: '42501' } },
      })

      expectFailure(await exit, (error) => {
        expect(error).toMatchObject({ _tag: 'ForbiddenError', message: 'Permission denied' })
      })
    })

    it('reads a unique violation the checks did not see as a version published meanwhile', async () => {
      // the checks and the insert are two round trips, so a version published
      // between them reaches the constraints; that is a refusal to reload on,
      // not a fault
      const { exit } = publish({
        insert: { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } },
      })

      expectFailureOf(await exit, ConcurrentPublishError, (error) => {
        expect(error.message).toBe('Another version was published meanwhile. Reload the page and try again.')
      })
    })

    it('fails any other insert error as a fault, cause attached', async () => {
      const { exit } = publish({
        insert: { data: null, error: { message: 'connection reset', code: '08006' } },
      })

      expectFailure(await exit, (error) => {
        expect(error).toMatchObject({ _tag: 'InsertWorkflowError' })
        expect((error as { message: string }).message).toContain('connection reset')
      })
    })
  })

  /**
   * #66. The export's `version` is not a version and does not start at 1: it
   * is the 0-based index of the latest revision, added to the export by
   * Galaxy's `workflow_to_dict` as `len(stored.workflows) - 1`
   * (`managers/workflows.py:1063`, dev 47c11fe5edbd). A workflow imported
   * from a file and never edited has one revision and exports `0`.
   */
  describe('the export\'s version, a 0-based revision index', () => {
    it.each([
      ['0, the only revision of an imported workflow', 0],
      ['1, the first save after creating in the editor', 1],
    ])('stores an export carrying %s as the row\'s revision', async (_label, revision) => {
      const { exit, mockClient } = publish({ galaxyExport: { ...mockGalaxyWorkflowExport, version: revision } })

      expect(Exit.isSuccess(await exit)).toBe(true)
      expect(insertedRow(mockClient)).toMatchObject({ revision })
    })

    it.each([
      ['a negative number', -1],
      ['a fraction', 1.5],
    ])('refuses %s, calling it the revision index rather than a version', async (_label, revision) => {
      // Galaxy cannot produce either, so an export carrying one is not what
      // it claims to be and is refused before anything is written
      const { exit, mockClient } = publish({ galaxyExport: { ...mockGalaxyWorkflowExport, version: revision } })

      expectFailure(await exit, (error) => {
        expect(error).toBeInstanceOf(GetWorkflowError)
        expect((error as GetWorkflowError).message).toContain('revision index')
        expect((error as GetWorkflowError).message).toContain(String(revision))
        // the glossary reserves "Version" for the label
        expect((error as GetWorkflowError).message).not.toMatch(/\bVersion\b/)
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })

    it('refuses a numeric string one layer up, in the export schema, before the range is read', async () => {
      // `galaxyWorkflowExportSchema` types `version` as a number, so a string
      // never reaches the range check: blendtype refuses the export as a whole
      const { exit, mockClient } = publish({ galaxyExport: { ...mockGalaxyWorkflowExport, version: '1' } })

      expectFailure(await exit, (error) => {
        expect(error).toMatchObject({ _tag: 'WorkflowError' })
        expect((error as { message: string }).message).toContain('Invalid workflow export format')
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })
  })

  it('refuses a caller with no claims rather than resolving with nothing', async () => {
    // the body used to sit in an `if (supabaseClaims)` with no `else`, so this
    // fell off the end of the generator and resolved as a success carrying
    // undefined -- which the endpoint answered with 200 and an empty body
    const { exit, mockClient } = publish({ claims: null })

    expectFailure(await exit, (error) => {
      expect(error).toMatchObject({ _tag: 'GetSupabaseUserError' })
    })
    // the insert path opens with .schema('galaxy'), so this proves it was never walked
    expect(mockClient.schema).not.toHaveBeenCalled()
  })
})
