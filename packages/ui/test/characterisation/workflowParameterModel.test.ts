/**
 * What the invoke form reads off a Galaxy workflow, pinned against real
 * recorded payloads (#86).
 *
 * This is a characterisation suite: it is not here to say the behaviour is
 * right, it is here to say what the behaviour *is*, so that the consolidation
 * in #87 and the switch of source in #88 can prove they changed nothing. If a
 * test here fails, the question is not "what is wrong with the test" but
 * "did I mean to change this".
 *
 * Two rules it follows, both from the ticket:
 *
 * 1. **The fixtures are recorded, never hand-written.** The point is to catch
 *    the shapes Galaxy really emits, including the ones nobody modelled — and
 *    a hand-written fixture can only contain shapes somebody thought of.
 *    `ConnectedValue` is the example: it is in every recording and in none of
 *    the design notes.
 * 2. **It asserts on the derived model, never on raw payload equality.**
 *    Comparing raw dicts means chasing key ordering and Galaxy's `__page__` /
 *    `__rerun_remap_job_id__` bookkeeping — differences that never reach a
 *    reader.
 *
 * Where the derivation exists in the application it is driven through the
 * real composable rather than copied, so that changing the composable breaks
 * this suite. Only the export-side derivation is written here, because
 * nothing in the application reads a stored definition yet; that function is
 * #88's acceptance contract.
 */

import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { encodeParam } from 'ufo'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { FIXTURES, loadFixture } from './fixtures'
import {
  describeParameters,
  edgesOf,
  parameterValuesFromExport,
  parameterValuesFromLive,
  renderedParameterNames,
  toolStepIds,
} from './parameterModel'

const ccqtl = loadFixture(FIXTURES.ccqtlToday)
const nested = loadFixture(FIXTURES.conditionalRepeatRuntime)
const fanIn = loadFixture(FIXTURES.fanIn)

/**
 * The path a tool has to be *registered* at for `useGalaxyTool`'s fetch of it
 * to arrive.
 *
 * `registerEndpoint` matches literally, so there is one registration per
 * tool: the module's real route is `/api/galaxy/tools/:toolId/:toolVersion`,
 * and a pattern written here would match nothing. `useGalaxyTool` asks
 * through `encodeParam`, which collapses a toolshed guid's slashes into one
 * `%2F`-escaped segment — and that part matches fine.
 *
 * What does not is `%2B`. A toolshed guid carries the version inside the id
 * (`…/ccqtl_make_inputs/0.0.1_beta.2+galaxy0`), so `encodeParam` escapes that
 * `+` to `%2B`, and a registration containing `%2B` is never reached: the
 * harness's router decodes the incoming path before matching but not the
 * registered one, so the two keys disagree. Registering the `+` literally is
 * what closes the gap. Measured, not guessed — `%2F` in the same segment and
 * a raw `+` in the version segment both match without this.
 *
 * This is the third place the `+` in a Galaxy version has bitten: #75 had
 * Galaxy itself read `1.2.3 galaxy0` because a raw `+` in a query decodes to
 * a space.
 */
function toolEndpointPath(toolId: string, version: string) {
  return `/api/galaxy/tools/${encodeParam(toolId).replace(/%2B/gi, '+')}/${version}`
}

/** Every recorded payload served at the path the application fetches it from. */
for (const fixture of [ccqtl, nested, fanIn]) {
  registerEndpoint(`/api/galaxy/workflows/${fixture.manifest.workflowId}`, () => ({
    data: fixture.live,
  }))
  for (const [key, tool] of Object.entries(fixture.tools)) {
    const at = key.lastIndexOf('@')
    registerEndpoint(toolEndpointPath(key.slice(0, at), key.slice(at + 1)), () => tool)
  }
}

/**
 * What `useGalaxyTool` takes. `nuxt-galaxy` does not re-export its
 * `ToolQuery` from the package root, and reaching into the runtime path for
 * one interface is not worth the coupling.
 */
interface ToolQuery { toolId: string, toolVersion: string }

/**
 * Run a composable where Vue expects one to run.
 *
 * `useGalaxyWorkflow` and `useGalaxyTool` both open a `watch` with
 * `immediate: true`, so they need an owning scope or the watcher is never
 * disposed and Vue says so. Mounting a component that does nothing but call
 * them is the cheapest scope there is, and it keeps the suite pinning the
 * real composables rather than a copy of their bodies.
 */
async function inSetup<T>(use: () => T): Promise<T> {
  let captured: T | undefined
  await mountSuspended(defineComponent({
    setup() {
      captured = use()
      return () => h('div')
    },
  }))
  return captured as T
}

/** The live model, taken through the composables the invoke form uses. */
async function liveModelThroughComposables(fixture: typeof ccqtl) {
  const { workflowSteps, workflowToolIds, workflowParametersModel } = await inSetup(() =>
    useGalaxyWorkflow(ref(fixture.manifest.workflowId)),
  )
  await expect.poll(() => Object.keys(workflowSteps.value).length).toBeGreaterThan(0)

  const toolIds = workflowToolIds.value as ToolQuery[]
  const { toolsObj, toolInputParameters } = await inSetup(() => useGalaxyTool(toolIds))
  // `useAsyncQueue` fills its result array as the fetches land, so the wait is
  // for every distinct tool rather than for the first.
  const distinct = new Set(toolIds.map(({ toolId }) => toolId)).size
  await expect.poll(() => Object.keys(toolsObj.value).length).toBe(distinct)

  return { workflowParametersModel, toolInputParameters, toolsObj }
}

describe('the model the invoke form derives, per recorded workflow', () => {
  describe(`${FIXTURES.ccqtlToday} — pasteur, galaxy 22.05, what production reads today`, () => {
    it('is recorded from the instance and version it claims', () => {
      expect(ccqtl.manifest.instance).toBe('galaxy.pasteur.fr')
      expect(ccqtl.manifest.galaxyVersion).toBe('22.05.1')
    })

    it('offers parameters for five tool steps, and for neither data input', () => {
      expect(toolStepIds(ccqtl.live.steps)).toEqual(['2', '3', '4', '5', '6'])
      expect(toolStepIds(ccqtl.exported.steps as Record<string, never>)).toEqual(['2', '3', '4', '5', '6'])
    })

    it('reads a runtime parameter as one, and a connected input as connected', () => {
      const model = parameterValuesFromLive(ccqtl.live)
      // Step 4 is the one the census found: every input it takes is left to
      // be supplied at run time, which is the shape the form has to offer a
      // field for rather than treat as a value.
      expect(model['4']).toMatchObject({
        clean_pr: { kind: 'RuntimeValue' },
        covar_modmat: { kind: 'RuntimeValue' },
        crossdata: { kind: 'RuntimeValue' },
        kloco: { kind: 'RuntimeValue' },
        n_perm: { kind: 'scalar', type: 'string' },
      })
      // Step 3's inputs come from the steps before it. The form must *not*
      // offer these: the graph supplies them.
      expect(model['3']).toMatchObject({
        clean_pr: { kind: 'ConnectedValue' },
        crossdata: { kind: 'ConnectedValue' },
        kloco: { kind: 'ConnectedValue' },
        add_covar: { kind: 'scalar', type: 'string' },
      })
    })

    it('writes a boolean as a string at 22.05', () => {
      // Pinned because 26.1 does not: see the cross-version test below. A
      // widget that parsed `"false"` would read `false` as a string here and
      // a boolean there, which is exactly the kind of difference the upgrade
      // could deliver silently.
      const model = parameterValuesFromLive(ccqtl.live)
      expect(model['5']!.adjust).toEqual({ kind: 'scalar', type: 'string' })
      expect((ccqtl.live.steps['5']!).tool_inputs.adjust).toBe('false')
    })
  })

  describe(`${FIXTURES.conditionalRepeatRuntime} — usegalaxy.eu, galaxy 26.1`, () => {
    it('is recorded from the version this refactor targets', () => {
      expect(nested.manifest.instance).toBe('usegalaxy.eu')
      expect(nested.manifest.galaxyVersion).toMatch(/^26\.1/)
    })

    it('reads a conditional nested inside a repeat, with its live branch', () => {
      // The interesting shape in this fixture, and the one a flat probe
      // structurally cannot reach: the conditional is not a top-level
      // parameter, it sits inside every block of a repeat.
      const model = parameterValuesFromLive(nested.live)
      expect(model['2']!.datasets).toEqual({
        kind: 'repeat',
        length: 5,
        uniformKeys: true,
        entry: {
          id_cond: {
            kind: 'conditional',
            currentCase: 1,
            inputs: { id_select: { kind: 'scalar', type: 'string' } },
          },
          input: { kind: 'ConnectedValue' },
        },
      })
    })

    it('lets the blocks of one repeat sit on different branches', () => {
      // Four blocks are on case 1 and the fifth on case 0. `uniformKeys`
      // above compares key *names*, so it stays true — the branch is a value,
      // not a key. Pinned separately because a derivation that read the first
      // block's case and applied it to the rest would look correct above and
      // be wrong here.
      const blocks = nested.live.steps['2']!.tool_inputs.datasets as unknown as { id_cond: { __current_case__: number } }[]
      expect(blocks.map(block => block.id_cond.__current_case__)).toEqual([1, 1, 1, 1, 0])
    })

    it('reads a conditional nested inside a section', () => {
      const model = parameterValuesFromLive(nested.live)
      const advanced = model['3']!.advanced as { kind: string, inputs: Record<string, unknown> }
      expect(advanced.kind).toBe('section')
      expect(advanced.inputs.conflict).toMatchObject({ kind: 'conditional', currentCase: 3 })
    })

    it('writes a boolean as a real boolean at 26.1', () => {
      const model = parameterValuesFromLive(nested.live)
      expect(model['1']!.gbk).toEqual({ kind: 'scalar', type: 'boolean' })
      expect((nested.live.steps['1']!).tool_inputs.gbk).toBe(true)
    })

    it('keeps a section nested rather than flattening it', () => {
      const model = parameterValuesFromLive(nested.live)
      expect(model['1']!.settings).toMatchObject({ kind: 'section' })
      const settings = model['1']!.settings as { inputs: Record<string, unknown> }
      expect(Object.keys(settings.inputs).sort()).toEqual(['attc_settings', 'protein_settings'])
    })
  })

  describe(`${FIXTURES.fanIn} — an input fed by two upstream outputs`, () => {
    it('keeps both connections in the export', () => {
      const edges = edgesOf(fanIn.exported as { steps: Record<string, never> })
      expect(edges['19']!['batchmode|input_fastas']).toEqual([
        { fromStep: 14, output: 'proviruses' },
        { fromStep: 14, output: 'viruses' },
      ])
    })

    it('loses one of them in the live payload, invisibly', () => {
      // The whole argument for reading the stored definition instead of the
      // live API (Q12), measured rather than reasoned. `_workflow_to_dict_instance`
      // assigns `input_steps` by input name in a loop, so the last connection
      // wins. Here both come from the *same* upstream step at different
      // outputs, so nothing downstream can even tell an edge went missing:
      // step 14 is still referenced, just not for `proviruses`.
      const edges = edgesOf(fanIn.live as unknown as { steps: Record<string, never> })
      expect(edges['19']!['batchmode|input_fastas']).toEqual([
        { fromStep: 14, output: 'viruses' },
      ])
    })

    it('pins the input name a connection is keyed by, separators and all', () => {
      // Galaxy keys connections by input name, and a nested input's name
      // carries `|`. The schema #82 replaced modelled a single optional key
      // literally called `input`, which this would have caught.
      const edges = edgesOf(fanIn.exported as { steps: Record<string, never> })
      expect(Object.keys(edges['9']!)).toContain('batchmode|input_fastas')
    })
  })
})

describe('the live payload and the stored definition, read side by side', () => {
  for (const fixture of [ccqtl, nested]) {
    it(`${fixture.slug}: derive the same parameter model`, () => {
      // The design doc left this open — "where does Q12 change widget
      // defaults?" — because one probe on one workflow could not settle it.
      // On both recordings the answer is nowhere: the export's `tool_state`
      // decodes to the same model the live `tool_inputs` column carries.
      //
      // This is the assertion #88 has to keep green. It is also the one most
      // likely to break for a good reason: Galaxy runs
      // `check_and_update_state()` on the way out of the export path, so a
      // tool that gained a parameter since the revision was saved will make
      // the export carry a key the live column lacks. If that happens, this
      // failing is the discovery, not the bug.
      expect(parameterValuesFromExport(fixture.exported as { steps: Record<string, never> }))
        .toEqual(parameterValuesFromLive(fixture.live))
    })
  }

  it('agree on which steps are tool steps', () => {
    for (const fixture of [ccqtl, nested, fanIn]) {
      expect(toolStepIds(fixture.exported.steps as Record<string, never>))
        .toEqual(toolStepIds(fixture.live.steps))
    }
  })
})

describe('what a step actually puts on screen', () => {
  it('renders the intersection of the tool\'s parameters and the step\'s saved values', async () => {
    // The model no single payload holds. `useGalaxyTool` drops every `data`
    // parameter, `Step.vue` renders only where the step's own model has a
    // value under that name, and what a reader sees is the overlap. Driven
    // through the real composables so that changing either breaks this.
    const { workflowParametersModel, toolInputParameters } = await liveModelThroughComposables(ccqtl)

    const step4 = ccqtl.live.steps['4']!
    const declared = toolInputParameters.value[step4.tool_id!]!.map(input => input.name)
    const saved = describeParameters(workflowParametersModel.value['4']!)

    // Two of six. `ccqtl_permutations` declares four `data` parameters and
    // two others, and `useGalaxyTool` drops every `data` one, so the panel
    // offers only the integer and the text field.
    expect(renderedParameterNames(declared, saved)).toEqual(['n_perm', 'strat_covar'])
  })

  it('offers nothing for a runtime parameter that is data-typed', () => {
    // Surfaced by the recording, and worth its own name: on step 4 Galaxy
    // saved `crossdata`, `clean_pr`, `kloco` and `covar_modmat` as
    // `RuntimeValue` — it expects them to be supplied when the workflow runs
    // — but all four are `data` parameters, and `useGalaxyTool` filters those
    // out before the panel is built. So GaaS never asks for them and the
    // reader has no way to provide them.
    //
    // Pinned as it is, not as it should be: a characterisation suite records
    // the behaviour so a change to it is visible. Whether this is a defect is
    // a separate question from whether it is what happens today.
    const step = ccqtl.live.steps['4']!
    const tool = ccqtl.tools[`${step.tool_id}@${step.tool_version}`]!
    const runtimeNames = Object.entries(step.tool_inputs)
      .filter(([, value]) => (value as { __class__?: string })?.__class__ === 'RuntimeValue')
      .map(([name]) => name)
      .sort()

    expect(runtimeNames).toEqual(['clean_pr', 'covar_modmat', 'crossdata', 'kloco'])
    for (const name of runtimeNames) {
      expect(tool.inputs.find(input => input.name === name)?.type, name).toBe('data')
    }
  })

  it('offers no parameter for a data input step, which declares no tool', async () => {
    const { workflowParametersModel } = await liveModelThroughComposables(ccqtl)
    expect(Object.keys(workflowParametersModel.value).sort()).toEqual(['2', '3', '4', '5', '6'])
  })
})

describe('the recordings themselves', () => {
  it('name the instance, version and revision they came from', () => {
    for (const fixture of [ccqtl, nested, fanIn]) {
      expect(fixture.manifest.instance).toBeTruthy()
      expect(fixture.manifest.galaxyVersion).toBeTruthy()
      expect(fixture.manifest.command).toContain('record-workflow-fixtures')
      expect(typeof fixture.manifest.revision).toBe('number')
    }
  })

  it('were served the tool versions they asked for', () => {
    // Galaxy's `get_tool` runs without `exact`, so it answers 200 with
    // another installed version when it lacks the one asked for. A fixture
    // recorded from the wrong version would pin the wrong parameter list
    // while looking perfectly healthy, so the recorder writes both and this
    // reads them back.
    for (const fixture of [ccqtl, nested]) {
      for (const [key, tool] of Object.entries(fixture.manifest.tools)) {
        expect(tool.servedVersion, `${fixture.slug} ${key}`).toBe(tool.askedVersion)
      }
    }
  })

  it('carry no history-dependent dataset options', () => {
    // `io_details=true` populates a data parameter's `options` from whichever
    // history the recording account touched last. Those are real dataset
    // names and they change between two runs an hour apart, so the recorder
    // blanks them. Nothing in the derived model reads them.
    for (const fixture of [ccqtl, nested]) {
      expect(fixture.manifest.datasetOptionsRedacted).toBe(true)
      for (const tool of Object.values(fixture.tools)) {
        for (const input of tool.inputs) {
          if (input.type === 'data') {
            expect(input.options.hda).toEqual([])
            expect(input.options.hdca).toEqual([])
          }
        }
      }
    }
  })
})
