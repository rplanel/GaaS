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
 * real code rather than copied, so that changing that code breaks this
 * suite: the model through the real composable, and what the endpoint
 * answers with through the server's own normaliser (#103). The one
 * derivation written out here is the export-side one in `parameterModel.ts`,
 * and it stays a copy on purpose — it was #88's acceptance contract, and it
 * is the independent reading the normaliser is measured against.
 */

import type { WorkflowFixture } from './fixtures'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { describedRevision } from '../describedSteps'
import { FIXTURES, loadFixture } from './fixtures'
import {
  declaredParameterNames,
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
 * Every recorded payload served as the one endpoint the application now
 * reads (#87): a revision's steps, its inputs and the definitions of the
 * tools it pins, in one answer.
 *
 * The steps and inputs are the recorded **export** taken through
 * `describedStepsOf` and `describedInputsOf` — the server's own normalisers,
 * the ones the endpoint itself calls (#88). Nothing is spelled out per field
 * here: a stub that patches the fields its assertions happen to need can
 * only answer "did I mean to change this" about those fields, and #97 found
 * that the hard way — one assertion silently could not run, and a field
 * nothing asserts on yet would not have announced itself (#103).
 *
 * Reaching the normalisers is settled and not a reach into `runtime/server/`
 * by path: both are published from `nuxt-galaxy`'s own entry, for the
 * reasons written beside them there, and `../describedSteps` is where the
 * rest of the suites already go through them (#89).
 *
 * One registration per fixture, where there used to be one per fixture plus
 * one per tool. `registerEndpoint` matches literally, so each tool needed
 * its own path — and a toolshed guid carries its version inside the id
 * (`…/ccqtl_make_inputs/0.0.1_beta.2+galaxy0`), whose `+` `encodeParam`
 * escapes to `%2B`, and a registered path containing `%2B` was never
 * reached: the harness decodes the incoming path before matching but not the
 * registered one. No tool id travels in a path any more, so none of that
 * applies; the `+` is inside the JSON body, where nothing decodes it.
 */
for (const fixture of [ccqtl, nested, fanIn]) {
  // Normalised once per fixture rather than inside the handler: the real
  // endpoint reads one row that never changes, so every request for this
  // revision is answered from the same description.
  const { steps, inputs } = describedRevision(fixture)
  registerEndpoint(
    `/api/galaxy/workflows/${fixture.manifest.workflowId}/revisions/${fixture.manifest.revision}/description`,
    () => ({
      steps,
      inputs,
      // The half of the answer a recording cannot supply. The endpoint
      // splits the tools a revision pins into the ones Galaxy resolved and
      // the ones it did not, and which side a tool falls on depends on what
      // that Galaxy holds when the question is asked — not on the revision.
      // So `tools` is every definition the recording captured, and
      // `unavailable` is empty because a recording has no way to say
      // otherwise. `test/components/InvokeForm.test.ts` is where an
      // unresolved tool is exercised; nothing here can pin that pairing, and
      // the test below asserting that the recorded tools are exactly the
      // pins the definition declares is as close as a recording gets.
      tools: fixture.tools,
      unavailable: [],
    }),
  )
}

/**
 * Run a composable where Vue expects one to run.
 *
 * `useGalaxyWorkflowDescription` opens a Pinia Colada query, which needs an
 * owning scope. Mounting a component that does nothing but call it is the
 * cheapest scope there is, and it keeps the suite pinning the real
 * composable rather than a copy of its body.
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

/**
 * One recording's description, taken through the composable the invoke form
 * reads it with — which is to say through the endpoint's answer, not past
 * it.
 *
 * #86 drove the two composables #87 deleted, on purpose: so that changing
 * them would break this suite. The seam has moved to the one that replaced
 * them; every assertion below is the one it was.
 */
async function descriptionThroughComposable(fixture: WorkflowFixture) {
  const { workflowSteps, workflowInputs, workflowParametersModel, toolsObj, toolInputParameters, unconnectedInputsByStep } = await inSetup(() =>
    useGalaxyWorkflowDescription(ref(fixture.manifest.workflowId), ref(fixture.manifest.revision)),
  )
  await expect.poll(() => Object.keys(workflowSteps.value).length).toBeGreaterThan(0)

  // One entry per `<toolId>@<version>` the endpoint served. It used to be
  // one per distinct tool *id*, because the composable dropped the version
  // on the way past and two versions of one tool collapsed into one entry
  // (#100). Only how a test reaches a tool moved; nothing it asserts about
  // what is rendered did.
  await expect.poll(() => Object.keys(toolsObj.value).length).toBe(Object.keys(fixture.tools).length)

  return { workflowSteps, workflowInputs, workflowParametersModel, toolInputParameters, toolsObj, unconnectedInputsByStep }
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
      // Step 4 is the one the census found: Galaxy saved every data input it
      // takes as `RuntimeValue` rather than `ConnectedValue`. #97 settled that
      // this is a difference in what the editor wrote, not in what will
      // happen — all four are connected, and the marker is not what Galaxy
      // consults at invoke. The suite still records which marker each carries,
      // because that is what the recording says; what changed is what it
      // means, which the `unconnectedInputsByStep` tests below pin.
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
      expect(ccqtl.live.steps['5']!.tool_inputs!.adjust).toBe('false')
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
      const blocks = nested.live.steps['2']!.tool_inputs!.datasets as unknown as { id_cond: { __current_case__: number } }[]
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
      expect(nested.live.steps['1']!.tool_inputs!.gbk).toBe(true)
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
    // The model no single payload holds. The composable drops every `data`
    // parameter, `Step.vue` renders only where the step's own model has a
    // value under that name, and what a reader sees is the overlap. Driven
    // through the real composable so that changing it breaks this.
    const { workflowParametersModel, toolInputParameters, workflowSteps } = await descriptionThroughComposable(ccqtl)

    // The pin read off the step the endpoint served, not off the recording
    // beside it. The two agree on every recorded step, and reaching past the
    // answer for a field the answer carries is the habit #103 was about.
    const step4 = workflowSteps.value['4']!
    const declared = toolInputParameters.value[`${step4.tool_id}@${step4.tool_version}`]!.map(input => input.name)
    const saved = describeParameters(workflowParametersModel.value['4']!)

    // Two of six. `ccqtl_permutations` declares four `data` parameters and
    // two others, and the composable drops every `data` one, so the panel
    // offers only the integer and the text field.
    expect(renderedParameterNames(declared, saved)).toEqual(['n_perm', 'strat_covar'])
  })

  it('offers nothing for a runtime parameter that is data-typed, because an edge feeds it', () => {
    // Updated deliberately by #97, which is the ticket this test was written
    // to provoke. What it recorded is unchanged and still asserted below: on
    // step 4 Galaxy saved `crossdata`, `clean_pr`, `kloco` and `covar_modmat`
    // as `RuntimeValue`, all four are `data` parameters, and the composable
    // drops every `data` parameter before the panel is built.
    //
    // What changed is the conclusion. #86 read this as a defect — "GaaS never
    // asks for them and the reader has no way to provide them" — on the
    // premise that a `RuntimeValue` is a request for a value. It is not.
    // Every one of the four is **connected**, to step 2 or step 3, and
    // `replacement_for_input` (`workflow/run.py:290` at 22.05) fills a data input from
    // `step.input_connections_by_name` without ever reading the marker. The
    // graph supplies them, the invocation succeeds, and offering a field for
    // them would have been wrong.
    const step = ccqtl.live.steps['4']!
    const tool = ccqtl.tools[`${step.tool_id}@${step.tool_version}`]!
    const exported = (ccqtl.exported.steps as Record<string, { input_connections: Record<string, unknown> }>)['4']!
    const runtimeNames = Object.entries(step.tool_inputs!)
      .filter(([, value]) => (value as { __class__?: string })?.__class__ === 'RuntimeValue')
      .map(([name]) => name)
      .sort()

    expect(runtimeNames).toEqual(['clean_pr', 'covar_modmat', 'crossdata', 'kloco'])
    for (const name of runtimeNames) {
      expect(tool.inputs.find(input => input.name === name)?.type, name).toBe('data')
      // The assertion #86 did not make, and the one that reverses its reading.
      expect(Object.keys(exported.input_connections), name).toContain(name)
    }
  })

  it('marks no step, because every data parameter it takes is fed', async () => {
    // Acceptance criterion 4 of #97, and the control for the tests on the
    // nested recording below: a workflow whose data parameters are all
    // connected or declared as inputs is unchanged by this ticket. Driven
    // through the real composable, so a rule that over-reports breaks here.
    const { unconnectedInputsByStep } = await descriptionThroughComposable(ccqtl)

    expect(unconnectedInputsByStep.value).toEqual({})
  })

  it('offers no parameter for a data input step, which declares no tool', async () => {
    const { workflowParametersModel } = await descriptionThroughComposable(ccqtl)
    expect(Object.keys(workflowParametersModel.value).sort()).toEqual(['2', '3', '4', '5', '6'])
  })

  it('marks the steps of the nested recording whose data parameters nothing feeds', async () => {
    // The case #97 turned out to be about, which the ticket did not name: it
    // is in this recording rather than in `ccqtl-today`. Three shapes at once,
    // and every one of them decided by the absence of an edge rather than by
    // which marker Galaxy wrote.
    const { unconnectedInputsByStep } = await descriptionThroughComposable(nested)

    expect(Object.keys(unconnectedInputsByStep.value).sort()).toEqual(['1', '2'])

    // Step 1, `integron_finder`. `sequence` is connected and absent from this
    // list; `topology_file` is `RuntimeValue` with no edge, and
    // `covar_matrix` is the same two levels down inside sections — which the
    // form renders nowhere at all, so it is both invisible and unsettable.
    expect(unconnectedInputsByStep.value['1']).toEqual([
      {
        name: 'topology_file',
        label: 'Select a topology file from your history',
        optional: true,
      },
      {
        name: 'settings|attc_settings|covar_matrix',
        label: 'Covariance Matrix',
        optional: true,
      },
    ])

    // Step 2, `__BUILD_LIST__`: five repeat entries against three
    // connections, so the last two are bare. They say `ConnectedValue` — the
    // marker #86 read as "the graph supplies this" — with no connection to
    // supply them, which is why the rule reads the edge and not the marker.
    expect(unconnectedInputsByStep.value['2']!.map(parameter => parameter.name))
      .toEqual(['datasets_3|input', 'datasets_4|input'])
  })

  it('offers the parameters inside a section, named the way Galaxy names them', async () => {
    // #101. `integron_finder` keeps nine parameters two levels down inside
    // `settings`, and until this ticket the panel rendered none of them: the
    // widget filter ran across the top level only, and `section` was in
    // neither `GalaxyToolParameterType` nor the component map, so a section
    // arrived as a parameter with a value, no component and no recursion.
    //
    // Eight of the nine are offered, not nine. The ninth is `covar_matrix`,
    // which is `data` — fed by an edge and never by this panel (#97) — so it
    // is dropped here and named by `unconnectedInputsByStep` instead, in the
    // assertion above. The two sides read the same `DATASET_INPUT_TYPES`
    // precisely so that they cannot say both.
    const { toolInputParameters, workflowSteps } = await descriptionThroughComposable(nested)
    const step1 = workflowSteps.value['1']!
    const offered = toolInputParameters.value[`${step1.tool_id}@${step1.tool_version}`]!

    expect(declaredParameterNames(offered)).toEqual([
      'local_max',
      'type_replicon',
      'promoter_attI',
      'gbk',
      'pdf',
      'settings|attc_settings|dist_thresh',
      'settings|attc_settings|calin_threshold',
      'settings|attc_settings|max_attc_size',
      'settings|attc_settings|min_attc_size',
      'settings|attc_settings|keep_palindromes',
      'settings|protein_settings|no_proteins',
      'settings|protein_settings|union_integrases',
      'settings|protein_settings|func_annot',
      'no_logfile',
    ])
  })

  it('keeps the section structure rather than flattening it into the top level', async () => {
    // The names above would read the same if the filter had flattened the
    // tree, and a flattened list is exactly what `Step.vue` cannot render:
    // it looks each name up in the step's own model, where `dist_thresh`
    // lives under `settings.attc_settings` and not at the top. So the shape
    // is pinned as well as the names.
    const { toolInputParameters, workflowSteps } = await descriptionThroughComposable(nested)
    const step1 = workflowSteps.value['1']!
    const offered = toolInputParameters.value[`${step1.tool_id}@${step1.tool_version}`]!

    expect(offered.map(input => input.name)).toEqual([
      'local_max',
      'type_replicon',
      'promoter_attI',
      'gbk',
      'pdf',
      'settings',
      'no_logfile',
    ])
    const settings = offered.find(input => input.name === 'settings')!
    expect(settings.type).toBe('section')
  })

  it('offers what survives inside a repeat, and drops a repeat with nothing left', async () => {
    // Both repeats in the recording, and they come out differently.
    //
    // `__BUILD_LIST__`'s `datasets` declares a `data` parameter and a
    // conditional; the data one goes and the conditional stays, so the block
    // still has something for a reader to set. `__MERGE_COLLECTION__`'s
    // `inputs` declares one child and it is a `data_collection`, so nothing
    // survives and the repeat is dropped whole rather than rendered as a
    // titled empty box promising a form that is not there.
    const { toolInputParameters, workflowSteps } = await descriptionThroughComposable(nested)

    const buildList = workflowSteps.value['2']!
    const buildListInputs = toolInputParameters.value[`${buildList.tool_id}@${buildList.tool_version}`]!
    expect(declaredParameterNames(buildListInputs)).toEqual([
      'datasets_*|id_cond|id_select',
      // `case2` is the `manual` branch, whose one input is a `text`
      // parameter — declared, offered, and since #113 mapped to a widget,
      // though no block of this revision is on that case to show one.
      'datasets_*|id_cond|case2|identifier',
    ])

    const merge = workflowSteps.value['3']!
    const mergeInputs = toolInputParameters.value[`${merge.tool_id}@${merge.tool_version}`]!
    expect(mergeInputs.map(input => input.name)).toEqual(['advanced'])
  })

  it('marks no step of the fan-in recording, which has no tool definitions to judge by', async () => {
    // Deciding that a parameter is data-typed needs the tool definition, and
    // this recording was made without any — a fan-in lives entirely in the
    // connections — so all twenty-two of its tool steps resolve to no
    // definition at all. That makes it the case that pins the guard: without
    // it the derivation reads `inputs` off `undefined` and the whole
    // description throws, emptying both screens rather than marking nothing.
    //
    // It cannot pin more than that. With no definition there are no types to
    // over-report from, so this says the missing case is *handled*, not that
    // the rule is right; the nested recording above is what says that.
    const { unconnectedInputsByStep } = await descriptionThroughComposable(fanIn)

    expect(unconnectedInputsByStep.value).toEqual({})
  })
})

/**
 * The half of the endpoint's answer the suite could not see until #103.
 *
 * The stub served the live payload, and a live step carries no `label`, no
 * `uuid` and no `outputs` at all — measured under "the recordings
 * themselves" below rather than argued here — so these three were
 * unobservable however faithfully the endpoint served them. They are pinned
 * now for the reason the rest of this file exists: a change to
 * `describedStepsOf` should be a failing assertion, not a field nobody
 * happens to be looking at.
 */
describe('what the endpoint says that the live payload cannot', () => {
  it('names the steps the author named, and leaves the rest null', async () => {
    // `null` and not `''`: the export writes the empty string for a step
    // nobody named as readily as it writes nothing, and the contract promises
    // one spelling for absent.
    const { workflowSteps } = await descriptionThroughComposable(ccqtl)
    const labels = Object.fromEntries(
      Object.entries(workflowSteps.value).map(([stepId, step]) => [stepId, step.label]),
    )
    expect(labels).toEqual({
      0: 'Phenotype dataset',
      1: 'Covariate dataset',
      2: null,
      3: null,
      4: null,
      5: null,
      6: null,
    })
  })

  it('gives every step a uuid of its own, which the stored definition is the only source of', async () => {
    // What this pins and what it does not. The live payload carries no step
    // uuid at all and one workflow-level `latest_workflow_uuid`, which is
    // the newest revision's whichever revision was asked for — so before
    // #103 a served step had no uuid whatsoever, and that is the regression
    // this catches.
    //
    // It does **not** show that the uuid belongs to the revision requested
    // rather than to the latest: `describedStepsOf` copies the export's
    // uuid straight through, and all three recordings are of the latest
    // revision, so the two answers coincide here. Telling them apart needs
    // a recording of an older revision, which no fixture is.
    const { workflowSteps } = await descriptionThroughComposable(ccqtl)
    const exported = ccqtl.exported.steps as Record<string, { uuid: string }>
    const served = Object.entries(workflowSteps.value)

    for (const [stepId, step] of served) {
      expect(step.uuid, stepId).toBe(exported[stepId]!.uuid)
    }
    expect(new Set(served.map(([, step]) => step.uuid)).size).toBe(served.length)
    expect(served.map(([, step]) => step.uuid)).not.toContain(ccqtl.live.latest_workflow_uuid)
  })

  it('carries the outputs a step declares, which is what an output handle is drawn for', async () => {
    const { workflowSteps } = await descriptionThroughComposable(ccqtl)
    expect(workflowSteps.value['3']!.outputs.map(output => output.name))
      .toEqual(['lod', 'out', 'covar_modmat'])
    // A data input step declares none, and that is Galaxy's own answer
    // rather than a gap in the normaliser.
    expect(workflowSteps.value['0']!.outputs).toEqual([])
  })

  it('derives the declared inputs from the definition, and agrees with Galaxy on this revision', async () => {
    // `describedInputsOf` re-derives what `GET /api/workflows/{id}` answers
    // with, because the export carries no `inputs` list of its own. Agreeing
    // is the measured fact and not a guarantee: this recording is of the
    // *latest* revision, which is the one Galaxy's own list describes.
    const { workflowInputs } = await descriptionThroughComposable(ccqtl)
    expect(workflowInputs.value).toEqual(ccqtl.live.inputs)
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

  it('say nothing in their live payload about a step\'s label, uuid or outputs', () => {
    // Why the stub could not serve the live payload and still be what the
    // endpoint serves (#103). Measured on both releases rather than read off
    // Galaxy's source: `_workflow_to_dict_instance` writes none of the
    // three, so a suite fed the live payload could not observe them at all.
    for (const fixture of [ccqtl, nested, fanIn]) {
      for (const [stepId, step] of Object.entries(fixture.live.steps)) {
        const keys = Object.keys(step)
        expect(keys, `${fixture.slug} step ${stepId}`).not.toContain('label')
        expect(keys, `${fixture.slug} step ${stepId}`).not.toContain('uuid')
        expect(keys, `${fixture.slug} step ${stepId}`).not.toContain('outputs')
      }
    }
  })

  it('hold a tool definition for exactly the tools their stored definition pins', () => {
    // The recorder reads the pins off the **live** payload and the endpoint
    // reads them off the export, so the keys the stub serves its `tools`
    // under are only the right ones while the two agree. Asserted rather
    // than assumed: a recording whose export pinned a version the recorder
    // never fetched would serve a step no definition at all, and the panel
    // would render empty for a reason no test names.
    for (const fixture of [ccqtl, nested]) {
      const pinned = Object.values(describedRevision(fixture).steps)
        .filter(step => step.type === 'tool' && step.tool_id !== null && step.tool_version !== null)
        .map(step => `${step.tool_id}@${step.tool_version}`)
      expect(new Set(Object.keys(fixture.tools)), fixture.slug).toEqual(new Set(pinned))
    }
    // `fan-in` was recorded `--no-tools`, so it pins tools and holds none.
    // That is the recording saying so, and it is why `unavailable` cannot be
    // derived from one: nothing here distinguishes a tool nobody recorded
    // from a tool Galaxy does not have.
    expect(Object.keys(fanIn.tools)).toEqual([])
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

  it('carry the step keys a stored definition is told apart by', () => {
    // #88 tells a row stored before the export schema was widened (#82) from
    // one Galaxy really produced by whether any step carries a key outside
    // the fourteen the old schema kept. `errors` and `position` are the two
    // Galaxy writes on every step unconditionally — measured here, on both
    // 22.05 and 26.1, rather than taken from reading its source. If a future
    // Galaxy stops writing both, that check starts refusing every row, and
    // this is where it says so first.
    for (const fixture of [ccqtl, nested, fanIn]) {
      const steps = Object.values(fixture.exported.steps as Record<string, Record<string, unknown>>)
      expect(steps.length, fixture.slug).toBeGreaterThan(0)
      for (const step of steps) {
        expect(Object.keys(step), `${fixture.slug} step ${String(step.id)}`).toContain('errors')
        expect(Object.keys(step), `${fixture.slug} step ${String(step.id)}`).toContain('position')
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
