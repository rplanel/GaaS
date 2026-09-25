import type { GalaxyTool } from 'blendtype'
import type { GalaxyCache } from '../../../../src/runtime/server/utils/galaxyCache'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'
import { noGalaxyCache, toolCacheKey } from '../../../../src/runtime/server/utils/galaxyCache'
import { missingToolsEffect, pinnedTools, pinnedToolsOfSteps, resolvePinnedToolsEffect } from '../../../../src/runtime/server/utils/grizzle/workflowTools'
import { createRecordingGalaxyLayer, expectFailure } from '../../fixtures'
import { dataInputStep, toolStep, workflowDefinition } from '../../workflowDefinition'

/**
 * #75, ADR 0004. Galaxy refuses to run a revision whose tools are not
 * installed at their exact pinned version (`require_exact_tool_versions`),
 * so publishing checks them first. These are the check's own rules: which
 * steps are looked up, what Galaxy's answers mean, and what is never asked.
 */

const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'
const BAR = 'toolshed.g2.bx.psu.edu/repos/iuc/bar/bar/2.0'

/** A revision with two tool steps and one dataset input. */
const twoTools = workflowDefinition({
  0: dataInputStep(0, 'Input FASTQ'),
  1: toolStep(1, FOO, '1.2.3+galaxy0'),
  2: toolStep(2, BAR, '2.0'),
})

/** What Galaxy answers for a tool it holds at the version asked for. */
function installed(toolId: string, version: string) {
  return { model_class: 'Tool', id: toolId, name: toolId.split('/').at(-2), version }
}

/** What ofetch throws for a Galaxy answer with that status, as far as blendtype reads it. */
function galaxyAnswers(statusCode: number) {
  return Object.assign(new Error(`[GET] "api/tools/…": ${statusCode}`), { statusCode })
}

/**
 * The tool an `api/tools/<id>?io_details=true&tool_version=<v>` call asks for,
 * read the way Galaxy reads it: the query value URL-decoded, so an encoded
 * `%2B` is the `+` a toolshed version carries. A raw `+` would decode to a
 * space here, as it does in Galaxy.
 */
function asked(url: string) {
  const match = /^api\/tools\/(.+)\?io_details=true&tool_version=(.+)$/.exec(url)
  if (!match)
    throw new Error(`not a tool lookup: ${url}`)
  return { toolId: match[1]!, toolVersion: decodeURIComponent(match[2]!.replaceAll('+', ' ')) }
}

/** A Galaxy that holds every tool at the version asked for, except where `except` says otherwise. */
function galaxyHolding(except: (toolId: string, toolVersion: string) => unknown = () => undefined) {
  return createRecordingGalaxyLayer(({ url }) => {
    const { toolId, toolVersion } = asked(url)
    return except(toolId, toolVersion) ?? installed(toolId, toolVersion)
  })
}

describe('pinnedTools', () => {
  it('lists each distinct tool and version the revision pins, in step order', () => {
    expect(pinnedTools(twoTools)).toEqual([
      { toolId: FOO, toolVersion: '1.2.3+galaxy0' },
      { toolId: BAR, toolVersion: '2.0' },
    ])
  })

  it('counts a tool two steps share once, and skips steps that are not tool steps', () => {
    const definition = workflowDefinition({
      0: dataInputStep(0, 'Input'),
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
      2: toolStep(2, FOO, '1.2.3+galaxy0'),
      3: toolStep(3, FOO, '1.3.0'),
    })

    expect(pinnedTools(definition)).toEqual([
      { toolId: FOO, toolVersion: '1.2.3+galaxy0' },
      { toolId: FOO, toolVersion: '1.3.0' },
    ])
  })
})

describe('missingToolsEffect', () => {
  it('answers nothing missing when Galaxy holds every tool at its pinned version', async () => {
    const galaxy = galaxyHolding()

    const missing = await missingToolsEffect(twoTools).pipe(Effect.provide(galaxy.layer), Effect.runPromise)

    expect(missing).toEqual([])
    // the pinned version travels URL-encoded: a raw `+` is a space to Galaxy,
    // which then holds no such version and answers another one
    expect(galaxy.calls.map(call => call.url).sort()).toEqual([
      `api/tools/${BAR}?io_details=true&tool_version=2.0`,
      `api/tools/${FOO}?io_details=true&tool_version=1.2.3%2Bgalaxy0`,
    ])
  })

  it('names a tool Galaxy does not have at all', async () => {
    // Galaxy answers 404 when no version of the tool is installed
    const galaxy = galaxyHolding(toolId => (toolId === BAR ? galaxyAnswers(404) : undefined))

    const missing = await missingToolsEffect(twoTools).pipe(Effect.provide(galaxy.layer), Effect.runPromise)

    expect(missing).toEqual([{ toolId: BAR, toolVersion: '2.0' }])
  })

  it('names a tool Galaxy holds only at another version', async () => {
    // asked for a version it does not have, Galaxy answers 200 with the
    // newest version of the same tool rather than 404 (`get_tool` with
    // `exact=False`), so the answer's version has to be read, not the status
    const galaxy = galaxyHolding(toolId => (toolId === FOO ? installed(FOO, '1.3.0') : undefined))

    const missing = await missingToolsEffect(twoTools).pipe(Effect.provide(galaxy.layer), Effect.runPromise)

    expect(missing).toEqual([{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }])
  })

  it('looks a tool two steps share up once', async () => {
    const definition = workflowDefinition({
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
      2: toolStep(2, FOO, '1.2.3+galaxy0'),
    })
    const galaxy = galaxyHolding()

    await missingToolsEffect(definition).pipe(Effect.provide(galaxy.layer), Effect.runPromise)

    expect(galaxy.calls).toHaveLength(1)
  })

  it('asks Galaxy nothing for a revision with no tool steps', async () => {
    const galaxy = createRecordingGalaxyLayer(() => new Error('Galaxy should not have been asked'))

    const missing = await missingToolsEffect(workflowDefinition({ 0: dataInputStep(0, 'Input') })).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(missing).toEqual([])
    expect(galaxy.calls).toEqual([])
  })

  it('lets Galaxy being unwell through as itself rather than calling a tool missing', async () => {
    // a 500 says nothing about the tool, so it is not read as missing; the
    // same goes for a 503, which blendtype retries before failing
    const galaxy = galaxyHolding(toolId => (toolId === BAR ? galaxyAnswers(500) : undefined))

    const exit = await missingToolsEffect(twoTools).pipe(Effect.provide(galaxy.layer), Effect.runPromiseExit)

    expect(Exit.isFailure(exit)).toBe(true)
    expectFailure(exit, (error) => {
      expect(error).toMatchObject({ _tag: 'ToolError', statusCode: 500 })
    })
  })
})

/**
 * #87, Q22. The description endpoint needs every pinned tool's definition
 * anyway, so the verdict `missingToolsEffect` answers for the publish dialog
 * is folded into that same fetch rather than run beside it: one pass, not 2N
 * round trips. These are the fold's own rules — what each of Galaxy's
 * answers means, what is cached and under which key, and what never fails.
 */

/**
 * A tool definition as `io_details=true` fills it, with every shape the
 * recorded fixtures carry: a data parameter whose `options` holds all four
 * of `hda`, `hdca`, `dce` and `ldda`, a data *collection* parameter with
 * options of its own, a select parameter whose `options` are the tool's own
 * choices, and a data parameter nested inside a conditional's case.
 */
function installedWithDatasetOptions(toolId: string, version: string) {
  return {
    ...installed(toolId, version),
    inputs: [
      {
        name: 'input',
        type: 'data',
        options: {
          hda: [{ id: 'hda-1', hid: 3, name: 'a dataset of the account\'s', src: 'hda', keep: false }],
          hdca: [{ id: 'hdca-1', hid: 4, name: 'a collection of the account\'s', src: 'hdca', keep: false }],
          dce: [{ id: 'dce-1', name: 'an element of one of them' }],
          ldda: [{ id: 'ldda-1', name: 'a library dataset' }],
        },
      },
      {
        name: 'collection',
        type: 'data_collection',
        options: {
          hdca: [{ id: 'hdca-2', hid: 5, name: 'a collection of the account\'s' }],
          dce: [{ id: 'dce-2' }],
        },
      },
      {
        name: 'mode',
        type: 'select',
        options: [['Fast', 'fast', true], ['Thorough', 'thorough', false]],
      },
      {
        name: 'advanced',
        type: 'conditional',
        cases: [
          {
            value: 'yes',
            inputs: [
              { name: 'nested', type: 'data', options: { hda: [{ id: 'hda-2' }], hdca: [] } },
            ],
          },
        ],
      },
    ],
  }
}

/** A cache backed by a plain map, so a test can read what was written and under which key. */
function recordingCache(): GalaxyCache & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>()
  return {
    entries,
    tool: (galaxyUrl, toolId, version) =>
      Effect.succeed(entries.get(toolCacheKey(galaxyUrl, toolId, version)) as GalaxyTool | undefined),
    writeTool: (galaxyUrl, toolId, servedVersion, tool) =>
      Effect.sync(() => {
        entries.set(toolCacheKey(galaxyUrl, toolId, servedVersion), tool)
      }),
    workflow: () => Effect.succeed(undefined),
    writeWorkflow: () => Effect.void,
  }
}

const GALAXY = 'https://galaxy.example.com'

describe('resolvePinnedToolsEffect', () => {
  it('serves every tool Galaxy holds at its pinned version, keyed by id and version', async () => {
    const galaxy = galaxyHolding()

    const resolved = await resolvePinnedToolsEffect(pinnedTools(twoTools), noGalaxyCache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(Object.keys(resolved.tools).sort()).toEqual([`${BAR}@2.0`, `${FOO}@1.2.3+galaxy0`])
    expect(resolved.unavailable).toEqual([])
  })

  it('reports a tool Galaxy does not hold at all as not_installed, and serves no definition for it', async () => {
    const galaxy = galaxyHolding(toolId => (toolId === BAR ? galaxyAnswers(404) : undefined))

    const resolved = await resolvePinnedToolsEffect(pinnedTools(twoTools), noGalaxyCache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(resolved.unavailable).toEqual([{ toolId: BAR, toolVersion: '2.0', reason: 'not_installed' }])
    expect(Object.keys(resolved.tools)).toEqual([`${FOO}@1.2.3+galaxy0`])
  })

  it('reports a tool Galaxy serves at another version as version_mismatch, naming that version', async () => {
    // `get_tool` resolves without `exact`, so a 200 can carry another
    // version of the same lineage. A mismatched definition is never served:
    // that is what `require_exact_tool_versions` means.
    const galaxy = galaxyHolding(toolId => (toolId === FOO ? installed(FOO, '1.3.0') : undefined))

    const resolved = await resolvePinnedToolsEffect(pinnedTools(twoTools), noGalaxyCache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(resolved.unavailable).toEqual([
      { toolId: FOO, toolVersion: '1.2.3+galaxy0', reason: 'version_mismatch', servedVersion: '1.3.0' },
    ])
    expect(Object.keys(resolved.tools)).toEqual([`${BAR}@2.0`])
  })

  it('reports a tool Galaxy could not answer for as unreachable, and describes the rest anyway', async () => {
    // One tool failing does not fail the request: a reader who can edit one
    // step of two is better served than one who gets a 503.
    const galaxy = galaxyHolding(toolId => (toolId === BAR ? galaxyAnswers(500) : undefined))

    const resolved = await resolvePinnedToolsEffect(pinnedTools(twoTools), noGalaxyCache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(resolved.unavailable).toEqual([{ toolId: BAR, toolVersion: '2.0', reason: 'unreachable' }])
    expect(Object.keys(resolved.tools)).toEqual([`${FOO}@1.2.3+galaxy0`])
  })

  it('fetches each pinned tool once, serving both its definition and its verdict', async () => {
    const galaxy = galaxyHolding(toolId => (toolId === BAR ? galaxyAnswers(404) : undefined))

    await resolvePinnedToolsEffect(pinnedTools(twoTools), noGalaxyCache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(galaxy.calls).toHaveLength(2)
  })

  describe('the history-dependent options of a data parameter', () => {
    // `io_details=true` fills them from whichever history the API account
    // touched last. They are a per-user snapshot of somebody else's
    // datasets, nothing on the client reads them, and caching them — this
    // cache never expires — would pin one account's history into every
    // later answer. `io_details` is also what makes Galaxy send `inputs` at
    // all, so it cannot simply be left off.
    async function servedDefinition() {
      const galaxy = galaxyHolding(toolId => installedWithDatasetOptions(toolId, '1.2.3+galaxy0'))
      const resolved = await resolvePinnedToolsEffect(
        [{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }],
        noGalaxyCache,
        GALAXY,
      ).pipe(Effect.provide(galaxy.layer), Effect.runPromise)
      return resolved.tools[`${FOO}@1.2.3+galaxy0`]!
    }

    it('go entirely, not key by key: a real payload carries four of them', async () => {
      // `hda`, `hdca`, `dce` and `ldda` all come from the same snapshot, and
      // a list of key names is a list the next Galaxy release can add to
      // without anyone noticing.
      expect((await servedDefinition()).inputs[0]).toEqual({ name: 'input', type: 'data', options: {} })
    })

    it('go from a data collection parameter too, which has its own', async () => {
      expect((await servedDefinition()).inputs[1]).toEqual({ name: 'collection', type: 'data_collection', options: {} })
    })

    it('go at any depth, a conditional\'s case included', async () => {
      const served = await servedDefinition()
      const nested = (served.inputs[3] as unknown as { cases: { inputs: unknown[] }[] }).cases[0]!.inputs[0]
      expect(nested).toEqual({ name: 'nested', type: 'data', options: {} })
    })

    it('leave a select parameter\'s options alone, which are the tool\'s own choices', async () => {
      expect((await servedDefinition()).inputs[2]).toEqual({
        name: 'mode',
        type: 'select',
        options: [['Fast', 'fast', true], ['Thorough', 'thorough', false]],
      })
    })
  })

  it('caches a definition under the version Galaxy served, never the version asked for', async () => {
    // The sharpest interaction between Q16 and Q22, and it exists only
    // because this cache has no expiry: written under the asked-for key, a
    // fallback answer would serve the wrong tool's parameters for ever.
    const cache = recordingCache()
    const galaxy = galaxyHolding(() => installed(FOO, '1.3.0'))

    await resolvePinnedToolsEffect([{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }], cache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect([...cache.entries.keys()]).toEqual([toolCacheKey(GALAXY, FOO, '1.3.0')])
    expect(cache.entries.has(toolCacheKey(GALAXY, FOO, '1.2.3+galaxy0'))).toBe(false)
  })

  it('serves a cached definition without asking Galaxy again', async () => {
    const cache = recordingCache()
    const first = galaxyHolding()
    await resolvePinnedToolsEffect(pinnedTools(twoTools), cache, GALAXY).pipe(
      Effect.provide(first.layer),
      Effect.runPromise,
    )

    const second = createRecordingGalaxyLayer(() => new Error('Galaxy should not have been asked again'))
    const resolved = await resolvePinnedToolsEffect(pinnedTools(twoTools), cache, GALAXY).pipe(
      Effect.provide(second.layer),
      Effect.runPromise,
    )

    expect(second.calls).toEqual([])
    expect(Object.keys(resolved.tools).sort()).toEqual([`${BAR}@2.0`, `${FOO}@1.2.3+galaxy0`])
  })

  it('caches nothing for a tool that failed, so a retry refetches only what failed', async () => {
    const cache = recordingCache()
    const galaxy = galaxyHolding(toolId => (toolId === BAR ? galaxyAnswers(500) : undefined))

    await resolvePinnedToolsEffect(pinnedTools(twoTools), cache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect([...cache.entries.keys()]).toEqual([toolCacheKey(GALAXY, FOO, '1.2.3+galaxy0')])
  })

  it('treats a cached definition at the wrong version as a miss rather than serving it', async () => {
    // The key promises the value is that version, and only this module's
    // own write keeps that promise. A store shared with an older build or
    // another application could hold anything, and serving a definition at
    // the wrong version is the one thing this endpoint must not do.
    const cache = recordingCache()
    cache.entries.set(toolCacheKey(GALAXY, FOO, '1.2.3+galaxy0'), installed(FOO, '9.9.9') as unknown as GalaxyTool)
    const galaxy = galaxyHolding()

    const resolved = await resolvePinnedToolsEffect(
      [{ toolId: FOO, toolVersion: '1.2.3+galaxy0' }],
      cache,
      GALAXY,
    ).pipe(Effect.provide(galaxy.layer), Effect.runPromise)

    expect(galaxy.calls, 'Galaxy was asked rather than the bad entry served').toHaveLength(1)
    expect(resolved.tools[`${FOO}@1.2.3+galaxy0`]).toMatchObject({ version: '1.2.3+galaxy0' })
  })

  it('asks Galaxy nothing, and answers empty, for a revision that pins no tool', async () => {
    const galaxy = createRecordingGalaxyLayer(() => new Error('Galaxy should not have been asked'))

    const resolved = await resolvePinnedToolsEffect([], noGalaxyCache, GALAXY).pipe(
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(resolved).toEqual({ tools: {}, unavailable: [] })
    expect(galaxy.calls).toEqual([])
  })
})

describe('pinnedToolsOfSteps', () => {
  it('reads the live payload\'s steps, which name a tool the same way the export does', () => {
    const live = {
      0: { id: 0, type: 'data_input', tool_id: null, tool_version: null },
      1: { id: 1, type: 'tool', tool_id: FOO, tool_version: '1.2.3+galaxy0' },
      2: { id: 2, type: 'tool', tool_id: FOO, tool_version: '1.2.3+galaxy0' },
    }

    expect(pinnedToolsOfSteps(Object.values(live))).toEqual([
      { toolId: FOO, toolVersion: '1.2.3+galaxy0' },
    ])
  })
})
