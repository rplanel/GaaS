import type { GalaxyTool, WorkflowRuntimeValue, WorkflowStepConnections, WorkflowToolParameters } from 'blendtype'
import { describe, expect, it } from 'vitest'
import { DATASET_INPUT_TYPES, unconnectedDatasetInputs } from '../../../src/runtime/app/utils/unconnectedDatasetInputs'

/**
 * #97. The data parameters of a tool step that nothing will supply.
 *
 * Galaxy writes **every** data parameter of a tool step as a runtime value —
 * `{"__class__": "RuntimeValue"}` or `{"__class__": "ConnectedValue"}` — and
 * `is_runtime_value` treats the two spellings identically. What actually fills
 * one at invoke is the step's connection: `replacement_for_input` reads
 * `step.input_connections_by_name` and nothing else, so the marker is never
 * consulted.
 *
 * Both hold on the two releases the recordings span. `is_runtime_value` is
 * `tools/parameters/basic.py:80` at 22.05 and moved to
 * `tools/parameters/workflow_utils.py:50` by 26.1 with its test unchanged;
 * `replacement_for_input` is `workflow/run.py:290` and `:460`.
 *
 * So the question is not which marker a parameter carries but whether
 * anything is joined to it, which is what these assert.
 */

/**
 * A tool input, named locally rather than taken from `blendtype`.
 *
 * Narrower than it was: #101 added `repeat` and `section` to
 * `GalaxyToolParameters`, so only `data_collection` is still outside it
 * (#114) — and a `data_collection` parameter is half of what there is to test
 * here, so a fixture typed against the union still could not express the
 * cases. `name` and `type` are what the subject reads, and are what this
 * checks.
 */
interface AToolInput { name: string, type: string, [key: string]: unknown }

/** A data parameter, in the shape `GET /api/tools/{id}?io_details=true` answers with. */
function dataParam(name: string, over: Record<string, unknown> = {}): AToolInput {
  return { name, label: name, type: 'data', optional: false, multiple: false, ...over }
}

function tool(inputs: AToolInput[]): GalaxyTool {
  return { inputs } as unknown as GalaxyTool
}

/** A saved data value, whichever of the two spellings Galaxy chose. */
function runtime(kind: 'RuntimeValue' | 'ConnectedValue' = 'RuntimeValue'): WorkflowRuntimeValue {
  return { __class__: kind }
}

/**
 * One step, checked against the declared types rather than cast to them.
 *
 * Both casts this used to carry are gone with #102: `WorkflowToolParameters`
 * admitted neither a `{"__class__": …}` marker as its own thing nor a
 * repeat's array of instance objects, so the shapes every assertion below is
 * _about_ were the shapes the declared type said were impossible. They are
 * `WorkflowRuntimeValue` and `WorkflowRepeatInstanceValue[]` now, and the
 * fixtures here are ordinary values of the type the subject takes.
 */
function step(
  tool_inputs: WorkflowToolParameters,
  input_connections: WorkflowStepConnections = {},
): { tool_inputs: WorkflowToolParameters, input_connections: WorkflowStepConnections } {
  return { tool_inputs, input_connections }
}

describe('a top-level data parameter', () => {
  it('is unsupplied when it is a runtime value with nothing joined to it', () => {
    // `integron_finder` step 1 of the `conditional-repeat-runtime` recording:
    // `topology_file` is data-typed, optional, saved as `RuntimeValue`, and
    // named by no connection. Galaxy accepts the invocation and runs the tool
    // with it empty, which is the silence #97 is about.
    const unsupplied = unconnectedDatasetInputs(
      tool([dataParam('sequence'), dataParam('topology_file', { optional: true, label: 'Select a topology file from your history' })]),
      step({ sequence: runtime('ConnectedValue'), topology_file: runtime() }, { sequence: { id: 0, output_name: 'output' } }),
    )

    expect(unsupplied).toEqual([
      { name: 'topology_file', label: 'Select a topology file from your history', optional: true },
    ])
  })

  it('is supplied when a connection names it, whichever marker it carries', () => {
    // `ccqtl-wf` step 4, the case #97 was filed on: four data inputs saved as
    // `RuntimeValue` and all four connected to steps 2 and 3. The marker is
    // stale, not meaningful — the graph supplies them — so none is unsupplied
    // and the invoke form is right to offer nothing.
    const names = ['crossdata', 'clean_pr', 'kloco', 'covar_modmat']
    const unsupplied = unconnectedDatasetInputs(
      tool(names.map(name => dataParam(name))),
      step(
        Object.fromEntries(names.map(name => [name, runtime()])),
        Object.fromEntries(names.map(name => [name, { id: 2, output_name: name }])),
      ),
    )

    expect(unsupplied).toEqual([])
  })

  it('is unsupplied when it says `ConnectedValue` and no connection exists', () => {
    // Not a hypothetical: `__BUILD_LIST__` on step 2 of the recording keeps
    // five repeat entries and three connections. Galaxy's own reading makes
    // the two markers one thing, so what decides is the connection.
    const unsupplied = unconnectedDatasetInputs(
      tool([dataParam('input', { optional: true })]),
      step({ input: runtime('ConnectedValue') }),
    )

    expect(unsupplied.map(p => p.name)).toEqual(['input'])
  })

  it('is left alone when it is not data-typed', () => {
    const unsupplied = unconnectedDatasetInputs(
      tool([{ name: 'n_perm', label: 'Permutations', type: 'integer', optional: false }]),
      step({ n_perm: '5' }),
    )

    expect(unsupplied).toEqual([])
  })

  it('is left alone when it holds a real value rather than a runtime marker', () => {
    // Nothing in a stored workflow does this — Galaxy's own comment at
    // Galaxy's own comment says all data parameters are runtime values
    // (`workflow/modules.py:602` at 22.05, `:1029` at 26.1) —
    // so a literal means something this function did not model, and the safe
    // reading of "I do not recognise this" is to say nothing about it.
    const unsupplied = unconnectedDatasetInputs(
      tool([dataParam('sequence')]),
      step({ sequence: { values: [{ id: 'abc', src: 'hda' }] } }),
    )

    expect(unsupplied).toEqual([])
  })

  it('is left alone when the saved state never mentions it', () => {
    const unsupplied = unconnectedDatasetInputs(tool([dataParam('sequence')]), step({}))

    expect(unsupplied).toEqual([])
  })

  it('counts a data collection too', () => {
    const unsupplied = unconnectedDatasetInputs(
      tool([{ name: 'coll', label: 'Collection', type: 'data_collection', optional: false }]),
      step({ coll: runtime() }),
    )

    expect(unsupplied.map(p => p.name)).toEqual(['coll'])
  })
})

describe('a nested data parameter', () => {
  it('is named the way Galaxy names it, through a section', () => {
    // `settings|attc_settings|covar_matrix` on step 1 of the recording. The
    // form renders no section at all today, so this one is invisible *and*
    // unsettable — which is the more reason to say the run will have it empty.
    const unsupplied = unconnectedDatasetInputs(
      tool([{
        name: 'settings',
        type: 'section',
        inputs: [{
          name: 'attc_settings',
          type: 'section',
          inputs: [dataParam('covar_matrix', { optional: true, label: 'Covariance Matrix' })],
        }],
      }]),
      step({ settings: { attc_settings: { covar_matrix: runtime() } } }),
    )

    expect(unsupplied).toEqual([
      { name: 'settings|attc_settings|covar_matrix', label: 'Covariance Matrix', optional: true },
    ])
  })

  it('is found in each repeat instance, indexed as Galaxy indexes it', () => {
    // `__BUILD_LIST__`, step 2 of the recording: five `datasets` entries and
    // connections for the first three. The blueprint declares one `input`; the
    // saved state is what says how many there are, so the walk follows the
    // state.
    const unsupplied = unconnectedDatasetInputs(
      tool([{ name: 'datasets', type: 'repeat', inputs: [dataParam('input', { optional: true })] }]),
      step(
        {
          datasets: [0, 1, 2, 3, 4].map(index => ({ __index__: index, input: runtime('ConnectedValue') })),
        },
        {
          'datasets_0|input': { id: 1, output_name: 'integron_log' },
          'datasets_1|input': { id: 1, output_name: 'integrons_table' },
          'datasets_2|input': { id: 1, output_name: 'summary' },
        },
      ),
    )

    expect(unsupplied.map(p => p.name)).toEqual(['datasets_3|input', 'datasets_4|input'])
  })

  it('names a repeat instance by its position, not by the index it carries', () => {
    // **Reversed by #101, against the source.** This asserted the opposite,
    // on the premise that "Galaxy keys the connection by `__index__`". It
    // does not. The name a connection is matched by at invoke is built by
    // `visit_input_values`, which renumbers first:
    //
    //     for i, d in enumerate(values):
    //         d["__index__"] = i
    //         new_name_prefix = name_prefix + f"{input.name}_{i}|"
    //
    // `tools/parameters/__init__.py:174-176` at 22.05, `:238-240` at 26.1.
    // `ToolModule.execute`'s callback takes that `prefixed_name`, and
    // `replacement_for_input` looks it up in `step.input_connections_by_name`
    // unchanged (`modules.py:1902-1920` and `run.py:296-298` at 22.05;
    // `modules.py:2205` and `run.py:464-467` at 26.1).
    //
    // So on a gapped state the stored `entries_2|input` names an instance
    // Galaxy has already renumbered to 1, and Galaxy will not find it either:
    // *both* instances run with the input empty, which is what this now says.
    // A gap cannot arise from Galaxy's own editor, which renumbers on every
    // save — this is state edited elsewhere, and the reading that matches
    // what would actually happen.
    //
    // It is also the reading `useGalaxyEncodeParameters` submits under, so
    // the mark and the payload cannot spell one input two ways.
    const unsupplied = unconnectedDatasetInputs(
      tool([{ name: 'entries', type: 'repeat', inputs: [dataParam('input', { optional: true })] }]),
      step(
        { entries: [{ __index__: 0, input: runtime() }, { __index__: 2, input: runtime() }] },
        { 'entries_2|input': { id: 1, output_name: 'out' } },
      ),
    )

    expect(unsupplied.map(p => p.name)).toEqual(['entries_0|input', 'entries_1|input'])
  })

  it('counts an entry it cannot read as taking up its position', () => {
    // Galaxy enumerates the whole list, so an entry with no `__index__` — the
    // legacy state `Repeat.value_from_basic` back-fills — still occupies a
    // position. Skipping it *and* its position would shift every instance
    // after it onto the name of the one before.
    const unsupplied = unconnectedDatasetInputs(
      tool([{ name: 'entries', type: 'repeat', inputs: [dataParam('input', { optional: true })] }]),
      step(
        { entries: [{ input: runtime() }, { __index__: 1, input: runtime() }] },
        {},
      ),
    )

    expect(unsupplied.map(p => p.name)).toEqual(['entries_1|input'])
  })

  it('follows the case a conditional is actually on', () => {
    // `__current_case__` is the case the revision was saved on, and the other
    // cases will not run at all.
    //
    // Both directions are asserted because only the pair pins the selection.
    // Each case here names its data parameter differently, so reading a fixed
    // case — the first, the last — looks for a key the saved state does not
    // have, finds nothing, and reports nothing: a walk of the wrong case fails
    // *silently*, which is indistinguishable from a clean step unless the
    // other case would have had something to say.
    const conditional = {
      name: 'source',
      type: 'conditional',
      test_param: { name: 'kind', type: 'select', options: [] },
      cases: [
        { value: 'history', inputs: [dataParam('from_history')] },
        { value: 'path', inputs: [dataParam('from_path')] },
      ],
    }

    expect(unconnectedDatasetInputs(
      tool([conditional]),
      step({ source: { kind: 'history', __current_case__: 0, from_history: runtime() } }),
    ).map(p => p.name)).toEqual(['source|from_history'])

    expect(unconnectedDatasetInputs(
      tool([conditional]),
      step({ source: { kind: 'path', __current_case__: 1, from_path: runtime() } }),
    ).map(p => p.name)).toEqual(['source|from_path'])
  })

  it('says nothing about a conditional whose saved case names no case at all', () => {
    // A conditional with no `__current_case__` is a state this function cannot
    // resolve, and guessing a case would report a parameter that may not run.
    const unsupplied = unconnectedDatasetInputs(
      tool([{
        name: 'source',
        type: 'conditional',
        test_param: { name: 'kind', type: 'select', options: [] },
        cases: [{ value: 'history', inputs: [dataParam('from_history')] }],
      }]),
      step({ source: { kind: 'history', from_history: runtime() } }),
    )

    expect(unsupplied).toEqual([])
  })

  it('is reported for a repeat instance even where a sibling is connected', () => {
    // `__MERGE_COLLECTION__` on steps 3 and 4 carries `RuntimeValue` in both
    // its entries and a connection for both, so it is clean; this is the same
    // shape with one edge missing.
    const unsupplied = unconnectedDatasetInputs(
      tool([{ name: 'inputs', type: 'repeat', inputs: [{ name: 'input', label: 'Input', type: 'data_collection', optional: false }] }]),
      step(
        { inputs: [{ __index__: 0, input: runtime() }, { __index__: 1, input: runtime() }] },
        { 'inputs_0|input': { id: 2, output_name: 'output' } },
      ),
    )

    expect(unsupplied).toEqual([{ name: 'inputs_1|input', label: 'Input', optional: false }])
  })
})

describe('the connection lookup', () => {
  it('accepts a fan-in, where one input carries an array of connections', () => {
    // The export keys a connection by input name with a value that is one
    // connection *or an array of them* — the fact `DescribedStep` exists to
    // keep. Either way the input is fed.
    const unsupplied = unconnectedDatasetInputs(
      tool([dataParam('reads', { multiple: true })]),
      step({ reads: runtime() }, { reads: [{ id: 1, output_name: 'out' }, { id: 2, output_name: 'out' }] }),
    )

    expect(unsupplied).toEqual([])
  })

  it('treats an empty array of connections as nothing joined', () => {
    const unsupplied = unconnectedDatasetInputs(
      tool([dataParam('reads', { multiple: true })]),
      step({ reads: runtime() }, { reads: [] }),
    )

    expect(unsupplied.map(p => p.name)).toEqual(['reads'])
  })
})

describe('a tool with nothing to report', () => {
  it('answers with an empty list rather than nothing', () => {
    expect(unconnectedDatasetInputs(tool([]), step({}))).toEqual([])
  })
})

describe('the set the widget filter shares', () => {
  it('names both kinds of dataset input, so the two readings cannot drift', () => {
    // `toolInputParameters` offers a widget for everything *not* in this set,
    // and this function reports what is in it with no edge. Read from two
    // hand-written lists the two disagreed: the filter tested `!== 'data'`
    // alone, so a `data_collection` parameter was given a widget slot — which
    // renders blank, nothing being mapped for it — *and* marked as
    // unconnected, telling the reader both that they may set it and that
    // nothing feeds it.
    //
    // `data_collection` is absent from `GalaxyToolParameterType`, so no type
    // error was ever going to catch that; this assertion is what does.
    expect([...DATASET_INPUT_TYPES].sort()).toEqual(['data', 'data_collection'])
  })
})
