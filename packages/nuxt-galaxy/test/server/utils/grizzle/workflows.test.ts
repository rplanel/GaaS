import type { GalaxyWorkflowExport } from 'blendtype'
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
  RevisionNotFoundError,
  VersionLabelTakenError,
  WorkflowNameLockedError,
  WorkflowNotFoundError,
  WorkflowToolsMissingError,
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
import { connection, dataInputStep, toolStep, workflowDefinition } from '../../workflowDefinition'

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
   * A Galaxy that exports `definition` and answers every tool lookup with the
   * tool at the version asked for, except where `except` answers otherwise.
   */
  function galaxyHolding(
    definition: unknown,
    except: (toolId: string) => unknown = () => undefined,
  ) {
    return createRecordingGalaxyLayer(({ url }) => {
      if (url.startsWith('api/workflows/'))
        return definition
      const match = /^api\/tools\/(.+)\?io_details=true&tool_version=(.+)$/.exec(url)
      if (!match)
        throw new Error(`unexpected Galaxy call: ${url}`)
      // read the way Galaxy reads a query value: decoded, a raw `+` being a space
      const toolVersion = decodeURIComponent(match[2]!.replaceAll('+', ' '))
      return except(match[1]!) ?? { model_class: 'Tool', id: match[1], version: toolVersion }
    })
  }

  /**
   * Runs `publishVersion` against an export, the versions already published
   * (what the pre-insert query answers) and a Supabase client whose insert
   * answers `insert`.
   */
  function publish(options: {
    body?: PublishVersionBody
    galaxyExport?: unknown
    /** A Galaxy layer of the test's own, when the calls made to Galaxy are what it asserts. */
    galaxyLayer?: ReturnType<typeof createRecordingGalaxyLayer>['layer']
    published?: ReturnType<typeof version>[]
    insert?: { data: unknown, error: unknown }
    claims?: typeof mockSupabaseUser | null
  } = {}) {
    const galaxyLayer = options.galaxyLayer ?? createMockGalaxyLayer(options.galaxyExport ?? mockGalaxyWorkflowExport)
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
        // Galaxy's number, index + 1: the export carries index 1
        expect(error.message).toBe('Revision 2 is already published as version "0.10" of "satelliteFinder".')
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
   * ADR 0004, #73. A version pins one revision, and the dialog lets the
   * administrator choose it: the export is asked for that revision, and the
   * row's revision, uuid and snapshot are that export's rather than the
   * latest's. Labels are not ordered, so an older revision can be published
   * after a newer one.
   */
  describe('the revision the body names', () => {
    /** The export Galaxy answers for revision 1, told apart from the latest by its uuid. */
    const olderExport = { ...mockGalaxyWorkflowExport, version: 1, uuid: '0b9a6ad1-6a6e-4d43-8c65-6a1f7e4a2c10' }

    it('exports the named revision and writes its index, uuid and snapshot', async () => {
      const galaxy = createRecordingGalaxyLayer(() => olderExport)
      const inserted = { id: 3, revision: 1 }

      const { exit, mockClient } = publish({
        body: { ...body, label: '0.10', revision: 1 },
        galaxyLayer: galaxy.layer,
        insert: { data: inserted, error: null },
      })

      expect(await exit).toEqual(Exit.succeed(inserted))
      expect(galaxy.calls).toEqual([{ method: 'GET', url: 'api/workflows/galaxy-workflow-1/download?style=export&version=1' }])
      expect(insertedRow(mockClient)).toMatchObject({
        revision: 1,
        revision_uuid: '0b9a6ad1-6a6e-4d43-8c65-6a1f7e4a2c10',
        definition: olderExport,
        version_key: '0.10',
      })
    })

    it('publishes an older revision while a newer one is already published, since labels are not ordered', async () => {
      const { exit, mockClient } = publish({
        body: { ...body, label: '0.10', revision: 1 },
        galaxyExport: olderExport,
        published: [version({ versionKey: '0.11', revision: 3 })],
        insert: { data: { id: 3 }, error: null },
      })

      expect(Exit.isSuccess(await exit)).toBe(true)
      expect(insertedRow(mockClient)).toMatchObject({ revision: 1, version_key: '0.10' })
    })

    it('exports the latest when the body names none, as before', async () => {
      const galaxy = createRecordingGalaxyLayer(() => ({ ...mockGalaxyWorkflowExport, version: 3 }))

      const { exit } = publish({ body, galaxyLayer: galaxy.layer })

      expect(Exit.isSuccess(await exit)).toBe(true)
      expect(galaxy.calls).toEqual([{ method: 'GET', url: 'api/workflows/galaxy-workflow-1/download?style=export' }])
    })

    it('refuses the named revision when it is already published, naming its label', async () => {
      // the check reads the revision off the export, which is the one asked
      // for, so choosing a published revision explicitly is refused the same
      // way the latest is when it already carries a label
      const { exit, mockClient } = publish({
        body: { ...body, label: '0.12', revision: 1 },
        galaxyExport: olderExport,
        published: [version({ versionKey: '0.10', revision: 1 })],
      })

      expectFailureOf(await exit, RevisionAlreadyPublishedError, (error) => {
        expect(error.message).toBe('Revision 2 is already published as version "0.10" of "satelliteFinder".')
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })

    it('fails as a fault when Galaxy exports another revision than the one asked for', async () => {
      // Galaxy answered, but not with the revision named: the export is not
      // what it claims to be, so nothing is written and the cause is logged
      // rather than shown as something the administrator could change
      const { exit, mockClient } = publish({
        body: { ...body, revision: 1 },
        galaxyExport: { ...mockGalaxyWorkflowExport, version: 2 },
      })

      expectFailureOf(await exit, GetWorkflowError, (error) => {
        expect(error.message).toContain('revision 1')
        expect(error.message).toContain('2')
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })
  })

  /**
   * #75, ADR 0004. Galaxy refuses to run a revision whose tools are not
   * installed at their exact pinned version (`require_exact_tool_versions`),
   * so publishing is a reviewed act: the tools are checked before anything is
   * written, and a version is not published while any is missing.
   */
  describe('the tools of the revision', () => {
    const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'
    const BAR = 'toolshed.g2.bx.psu.edu/repos/iuc/bar/bar/2.0'

    /** An export of revision 3 of "Satellite Finder" pinning two tools. */
    const withTools = {
      ...workflowDefinition({ 1: toolStep(1, FOO, '1.2.3+galaxy0'), 2: toolStep(2, BAR, '2.0') }),
      name: 'Satellite Finder',
      version: 3,
    }

    /** What ofetch throws for a Galaxy answer with that status. */
    function galaxyAnswers(statusCode: number) {
      return Object.assign(new Error(`[GET] "api/tools/…": ${statusCode}`), { statusCode })
    }

    /** The shared Galaxy, pinned to this describe's export. */
    const galaxy = (except?: (toolId: string) => unknown) => galaxyHolding(withTools, except)

    function toolLookups(calls: { url: string }[]) {
      return calls.filter(call => call.url.startsWith('api/tools/'))
    }

    it('refuses a revision whose tools Galaxy lacks at their pinned version, naming them, before anything is written', async () => {
      // one tool Galaxy has at another version only (a 200 carrying it), one
      // it has no version of (a 404): both are missing at the pinned version
      const recording = galaxy(toolId => (toolId === FOO
        ? { model_class: 'Tool', id: FOO, version: '1.3.0' }
        : toolId === BAR ? galaxyAnswers(404) : undefined))

      const { exit, mockClient } = publish({ body: { ...body, revision: 3 }, galaxyLayer: recording.layer })

      expectFailureOf(await exit, WorkflowToolsMissingError, (error) => {
        expect(error.message).toBe(
          // Galaxy's number for the revision the export indexes as 3
          `Revision 4 of "Satellite Finder" uses tools missing in Galaxy at their pinned version: ${FOO} 1.2.3+galaxy0, ${BAR} 2.0. Install them or choose another revision.`,
        )
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })

    it('publishes when Galaxy holds every tool at its pinned version, having looked each up once', async () => {
      const recording = galaxy()

      const { exit, mockClient } = publish({ body: { ...body, revision: 3 }, galaxyLayer: recording.layer })

      expect(Exit.isSuccess(await exit)).toBe(true)
      expect(toolLookups(recording.calls).map(call => call.url).sort()).toEqual([
        `api/tools/${BAR}?io_details=true&tool_version=2.0`,
        // encoded, since a raw `+` would reach Galaxy as a space
        `api/tools/${FOO}?io_details=true&tool_version=1.2.3%2Bgalaxy0`,
      ])
      expect(insertedRow(mockClient)).toMatchObject({ revision: 3, definition: withTools })
    })

    it('lets Galaxy being unwell during the check fail as itself, not as a refusal', async () => {
      const recording = galaxy(toolId => (toolId === BAR ? galaxyAnswers(500) : undefined))

      const { exit, mockClient } = publish({ body: { ...body, revision: 3 }, galaxyLayer: recording.layer })

      expectFailure(await exit, (error) => {
        expect(error).toMatchObject({ _tag: 'ToolError', statusCode: 500 })
        expect(error).not.toBeInstanceOf(WorkflowToolsMissingError)
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })

    it('checks the tools only once the label, the revision and the name have passed', async () => {
      // a refusal the administrator fixes by retyping never costs the Galaxy
      // round trips; the tools are the last thing looked at before the insert
      const recording = galaxy()

      const { exit } = publish({
        body: { ...body, revision: 3 },
        galaxyLayer: recording.layer,
        published: [version({ versionKey: '0.11', revision: 0 })],
      })

      expectFailureOf(await exit, VersionLabelTakenError, () => {})
      expect(toolLookups(recording.calls)).toEqual([])
    })
  })

  /**
   * #82. A stored definition exists to be drawn from, and the row kept no
   * connections at all: `galaxyWorkflowExportSchema` is parsed loosely, but
   * that reaches the outer object only, and the nested step schema stripped. What reached the column described a set of steps
   * with nothing joining them. Nothing read the fields yet, so it was latent
   * rather than visible, which is why it needs a test at the publishing
   * boundary and not only in the schema.
   */
  describe('the connections of the stored definition', () => {
    const CAT = 'toolshed.g2.bx.psu.edu/repos/bgruening/text_processing/cat1/1.0.0'

    /**
     * Two inputs whose outputs both feed one input of the tool step. Galaxy
     * keys connections by input name and writes the value as an array when
     * several feed one, collapsing a singleton back to a bare object.
     */
    const fanIn = workflowDefinition({
      0: dataInputStep(0, 'Input FASTQ'),
      1: dataInputStep(1, 'Input reference'),
      2: toolStep(2, CAT, '1.0.0', {
        input_connections: {
          'input1': connection(0),
          'queries_0|input2': [connection(1), connection(0)],
        },
      }),
    })

    function storedDefinition(mockClient: ReturnType<typeof createMockServerSupabaseClientLayer>['mockClient']) {
      return insertedRow(mockClient).definition as GalaxyWorkflowExport
    }

    it('keeps both connections when two upstream outputs feed one input', async () => {
      const { exit, mockClient } = publish({ galaxyLayer: galaxyHolding(fanIn).layer })

      expect(Exit.isSuccess(await exit)).toBe(true)
      expect(storedDefinition(mockClient).steps['2']!.input_connections).toEqual({
        'input1': { id: 0, output_name: 'output' },
        'queries_0|input2': [
          { id: 1, output_name: 'output' },
          { id: 0, output_name: 'output' },
        ],
      })
    })

    it('keeps the layout, the condition and the subworkflow of a step', async () => {
      const conditional = workflowDefinition({
        0: dataInputStep(0, 'Input FASTQ'),
        1: toolStep(1, CAT, '1.0.0', {
          when: '$(inputs.run_it)',
          subworkflow: { a_galaxy_workflow: 'true', steps: { 0: { id: 0, type: 'data_input' } } },
        }),
      })

      const { exit, mockClient } = publish({ galaxyLayer: galaxyHolding(conditional).layer })

      expect(Exit.isSuccess(await exit)).toBe(true)
      const step = storedDefinition(mockClient).steps['1']!
      expect(step.position).toEqual({ left: 240, top: 120 })
      expect(step.when).toBe('$(inputs.run_it)')
      expect(step.subworkflow).toEqual({ a_galaxy_workflow: 'true', steps: { 0: { id: 0, type: 'data_input' } } })
    })

    it('stores the export whole, not the subset the client models', async () => {
      // the guard against the nested schema stripping again: a key nothing
      // here models is still part of the definition the graph is drawn from
      const withUnmodelled = {
        ...fanIn,
        steps: { ...fanIn.steps, 0: { ...fanIn.steps[0]!, an_unmodelled_galaxy_key: 'kept' } },
      }

      const { exit, mockClient } = publish({ galaxyLayer: galaxyHolding(withUnmodelled).layer })

      expect(Exit.isSuccess(await exit)).toBe(true)
      expect(storedDefinition(mockClient)).toEqual(withUnmodelled)
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

  /**
   * The body may name a revision Galaxy has no such index for, or a stored
   * workflow Galaxy no longer has. Galaxy answers 400 for an index past the
   * end of the history and 404 for an id it does not know; both used to
   * propagate as blendtype's `WorkflowError`, which no status map knows, so
   * the caller read `500 Internal Server Error` for a value it can fix.
   */
  describe('a revision or a stored workflow Galaxy does not have', () => {
    /** What ofetch throws for a Galaxy answer with that status, as far as blendtype reads it. */
    function galaxyAnswers(statusCode: number) {
      return createRecordingGalaxyLayer(() => Object.assign(new Error(`[GET] "api/workflows/…": ${statusCode}`), { statusCode }))
    }

    it('refuses a revision Galaxy has no such index for, naming it', async () => {
      const { exit, mockClient } = publish({ body: { ...body, revision: 999 }, galaxyLayer: galaxyAnswers(400).layer })

      expectFailure(await exit, (error) => {
        expect(error).toBeInstanceOf(RevisionNotFoundError)
        // the body carries the index 999; the administrator reads Galaxy's number
        expect((error as RevisionNotFoundError).message).toBe('Galaxy has no revision 1000 of stored workflow galaxy-workflow-1.')
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })

    it('refuses a stored workflow Galaxy no longer has, when no revision was named', async () => {
      const { exit, mockClient } = publish({ galaxyLayer: galaxyAnswers(404).layer })

      expectFailure(await exit, (error) => {
        expect(error).toBeInstanceOf(RevisionNotFoundError)
        expect((error as RevisionNotFoundError).message).toBe('Galaxy no longer has stored workflow galaxy-workflow-1.')
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })

    it('lets any other failure of the export through as blendtype\'s own, not as a refusal', async () => {
      // a 500 from Galaxy says nothing about the revision; it stays a fault
      const { exit, mockClient } = publish({ body: { ...body, revision: 3 }, galaxyLayer: galaxyAnswers(500).layer })

      expectFailure(await exit, (error) => {
        expect(error).toMatchObject({ _tag: 'WorkflowError', statusCode: 500 })
      })
      expect(mockClient.schema).not.toHaveBeenCalled()
    })
  })
})
