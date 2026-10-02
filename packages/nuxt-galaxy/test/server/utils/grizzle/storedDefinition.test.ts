import type { WorkflowStepExport } from 'blendtype'
import { describe, expect, it } from 'vitest'
import { describedInputsOf, describedStepsOf, predatesWidenedSchema } from '../../../../src/runtime/server/utils/grizzle/storedDefinition'
import { connection, dataInputStep, subworkflowStep, toolStep, workflowDefinition } from '../../workflowDefinition'

/**
 * #88. The stored definition, read as the one shape this application
 * describes a revision in.
 *
 * The switch of source is what makes these functions exist: the export says
 * everything the live payload says and two things it cannot — every
 * connection of a fan-in, and the list of a step's outputs — but says them
 * in its own spelling, and nothing normalised between the two.
 */

const FOO = 'toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3+galaxy0'
const BAR = 'toolshed.g2.bx.psu.edu/repos/iuc/bar/bar/2.0.0'

describe('describedStepsOf', () => {
  it('decodes the tool state the export carries as a JSON string', () => {
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0', { tool_state: '{"n": "3", "adjust": "false"}' }),
    }))

    // The live payload handed `tool_inputs` back as the raw database column;
    // the export writes the same values `json.dumps`ed. Decoding it is the
    // whole difference, and #86 pinned that the two agree.
    expect(steps['1']!.tool_inputs).toEqual({ n: '3', adjust: 'false' })
  })

  it('reads a state that will not parse as no parameters, rather than failing the revision', () => {
    // Galaxy dumps "the last known state without modifications" for a tool it
    // no longer holds. One step a reader cannot edit is not a workflow
    // nobody can open.
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0', { tool_state: 'not json' }),
    }))

    expect(steps['1']!.tool_inputs).toEqual({})
  })

  it('keeps every connection of an input fed by two upstream outputs', () => {
    // The argument for reading the stored definition at all. Galaxy's live
    // dict assigns `input_steps[conn.input_name]` in a loop, so the last
    // connection wins and the rest vanish with nothing to show for it.
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
      2: toolStep(2, BAR, '2.0.0', {
        input_connections: {
          'batchmode|input_fastas': [connection(1, 'proviruses'), connection(1, 'viruses')],
        },
      }),
    }))

    expect(steps['2']!.input_connections).toEqual({
      'batchmode|input_fastas': [
        { id: 1, output_name: 'proviruses' },
        { id: 1, output_name: 'viruses' },
      ],
    })
  })

  it('keeps a single connection as the bare object Galaxy collapses it to', () => {
    // `_workflow_to_dict_export` replaces a singleton list with the dict
    // itself, a back-compat hack its own comment says must never be removed.
    // Both shapes arrive and both are kept as they arrived.
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
    }))

    expect(steps['1']!.input_connections).toEqual({ input1: { id: 0, output_name: 'output' } })
  })

  it('carries the outputs a step declares, which the live payload has no list of at all', () => {
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0', {
        outputs: [{ name: 'out_file1', type: 'tabular' }],
      }),
    }))

    expect(steps['1']!.outputs).toEqual([{ name: 'out_file1', type: 'tabular' }])
  })

  it('carries the defaults the workflow gives a step\'s inputs, unwrapped from the export\'s `in`', () => {
    // #105. From 24.1 Galaxy fills an input nothing connects from one of
    // these, so a mark that cannot see them names a gap that is not there —
    // and from 24.2 refuses a submission Galaxy would run. `in` is kept by
    // the loose step schema without being modelled, hence the assign.
    const defaulted = Object.assign(toolStep(1, FOO, '1.2.3+galaxy0'), {
      in: { 'settings|reference': { default: { class: 'File', location: 'https://example.org/ref.fasta' } } },
    })
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: defaulted,
      2: toolStep(2, BAR, '2.0.0'),
    }))

    expect(steps['1']!.input_defaults).toEqual({
      'settings|reference': { class: 'File', location: 'https://example.org/ref.fasta' },
    })
    expect(steps['2']!.input_defaults, 'a step that sets none').toEqual({})
  })

  it('names the step the way the screens already read it', () => {
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0', { label: 'Trim', annotation: 'trims the reads' }),
    }))

    expect(steps['1']).toMatchObject({
      id: 1,
      type: 'tool',
      label: 'Trim',
      uuid: 'uuid-1',
      annotation: 'trims the reads',
      tool_id: FOO,
      tool_version: '1.2.3+galaxy0',
    })
  })

  it('reads an unannotated step as null rather than the empty string the export writes', () => {
    // `annotation: null | string` is what the screens' type promises, and
    // `_workflow_to_dict_instance` writes `null`; the export writes `""`.
    const steps = describedStepsOf(workflowDefinition({ 0: dataInputStep(0, 'Reads') }))

    expect(steps['0']!.annotation).toBeNull()
  })

  it('keys the steps by order index, which is what a connection and a job row name', () => {
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
      2: toolStep(2, BAR, '2.0.0'),
    }))

    expect(Object.keys(steps)).toEqual(['0', '1', '2'])
    expect(Object.values(steps).map(step => step.id)).toEqual([0, 1, 2])
  })
})

describe('describedInputsOf', () => {
  it('declares one input per input step, keyed by its index', () => {
    const inputs = describedInputsOf(describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Phenotype dataset'),
      1: dataInputStep(1, 'Covariate dataset'),
      2: toolStep(2, FOO, '1.2.3+galaxy0'),
    })))

    expect(inputs).toEqual({
      0: { label: 'Phenotype dataset', value: '', uuid: 'uuid-0' },
      1: { label: 'Covariate dataset', value: '', uuid: 'uuid-1' },
    })
  })

  it('falls back to the name in the saved state, then to what the type is called', () => {
    // Galaxy's own order of fallbacks: `step.label or step.tool_inputs.get("name")`,
    // then one fixed string per input type.
    const inputs = describedInputsOf(describedStepsOf(workflowDefinition({
      0: dataInputStep(0, null, { tool_state: '{"optional": false, "name": "Named in state"}' }),
      1: dataInputStep(1, null),
      2: dataInputStep(2, null, { type: 'data_collection_input' }),
      3: dataInputStep(3, null, { type: 'parameter_input' }),
    })))

    expect(Object.values(inputs).map(input => input.label)).toEqual([
      'Named in state',
      'Input Dataset',
      'Input Dataset Collection',
      'Input Parameter',
    ])
  })

  it('declares no input for a tool step', () => {
    const inputs = describedInputsOf(describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
    })))

    expect(Object.keys(inputs)).toEqual(['0'])
  })
})

describe('describedStepsOf, on a subworkflow step', () => {
  it('normalises the nested definition the step embeds', () => {
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: subworkflowStep(1, 'Trim and map', {
        0: dataInputStep(0, 'Nested reads'),
        1: toolStep(1, FOO, '1.2.3+galaxy0'),
      }),
    }))

    // One node with a whole workflow behind it, never expanded into the
    // parent's own steps (Q19): the outer definition still has exactly two.
    expect(Object.keys(steps)).toEqual(['0', '1'])
    expect(steps['1']!.type).toBe('subworkflow')
    expect(steps['1']!.subworkflow?.name).toBe('Trim and map')
    expect(Object.keys(steps['1']!.subworkflow?.steps ?? {})).toEqual(['0', '1'])
  })

  it('normalises a nested step exactly as it normalises an outer one', () => {
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: subworkflowStep(1, 'Trim and map', {
        0: dataInputStep(0, 'Nested reads'),
        1: toolStep(1, FOO, '1.2.3+galaxy0', { tool_state: '{"n": "7"}' }),
      }),
    }))

    // The whole point of one shape for one thing: a reader who drills into
    // the node gets steps it can draw with the same code, connections and
    // decoded state included.
    const nested = steps['1']!.subworkflow!.steps['1']!
    expect(nested.tool_inputs).toEqual({ n: '7' })
    expect(nested.input_connections).toEqual({ input1: { id: 0, output_name: 'output' } })
    expect(nested.subworkflow).toBeNull()
  })

  it('walks a subworkflow nested inside a subworkflow', () => {
    // Two levels, as `subworkflow-nested` really is. A normaliser that read
    // the first level and stopped would pass every test above.
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: subworkflowStep(1, 'Outer', {
        0: dataInputStep(0, 'Nested reads'),
        1: subworkflowStep(1, 'Inner', {
          0: dataInputStep(0, 'Innermost reads'),
          1: toolStep(1, BAR, '2.0.0'),
        }),
      }),
    }))

    const inner = steps['1']!.subworkflow!.steps['1']!
    expect(inner.subworkflow?.name).toBe('Inner')
    expect(inner.subworkflow!.steps['1']!.tool_id).toBe(BAR)
  })

  it('answers null for the three keys Galaxy leaves out, and for a step that embeds nothing', () => {
    const steps = describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: subworkflowStep(1, 'Trim and map', { 0: dataInputStep(0, 'Nested reads') }),
    }))

    // A subworkflow step carries no tool, and the contract promises one
    // spelling for absent — the export writes `tool_id: null` but omits
    // `tool_version` and `tool_state` entirely.
    expect(steps['1']!.tool_id).toBeNull()
    expect(steps['1']!.tool_version).toBeNull()
    expect(steps['1']!.tool_inputs).toEqual({})
    // And the other way round: every step that is not a subworkflow says so.
    expect(steps['0']!.subworkflow).toBeNull()
  })

  it('declares no workflow input for a subworkflow step', () => {
    // Galaxy's `input_step_types` lists the three input types and not this
    // one, so a subworkflow step is not something a datamap supplies — even
    // though the workflow behind it has inputs of its own.
    const inputs = describedInputsOf(describedStepsOf(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: subworkflowStep(1, 'Trim and map', { 0: dataInputStep(0, 'Nested reads') }),
    })))

    expect(Object.keys(inputs)).toEqual(['0'])
  })
})

describe('predatesWidenedSchema', () => {
  /**
   * A step as the pre-#82 schema left it: every key outside its fourteen
   * stripped away.
   *
   * The list is re-spelled here rather than imported from the module under
   * test, on purpose: it is a historical fact — what that schema kept — and
   * the module's copy is a claim about it. Sharing one constant would make
   * the fixture agree with the check by construction and the pair could then
   * be wrong together. Kept apart, both directions of drift fail a test: drop
   * a key from the module's set and a real legacy step stops being
   * recognised; add one and a definition Galaxy really produced starts being
   * flagged.
   */
  function stripped(step: WorkflowStepExport): Record<string, unknown> {
    const kept = new Set([
      'annotation',
      'content_id',
      'id',
      'input_connections',
      'inputs',
      'label',
      'name',
      'outputs',
      'tool_id',
      'tool_state',
      'tool_version',
      'type',
      'uuid',
      'workflow_outputs',
    ])
    return Object.fromEntries(
      Object.entries(step as unknown as Record<string, unknown>)
        .filter(([key]) => kept.has(key))
        // the old schema modelled one optional key literally named `input`,
        // which no real workflow uses, so every connection landed as `{}`
        .map(([key, value]) => (key === 'input_connections' ? [key, {}] : [key, value])),
    )
  }

  it('recognises a row stored before the schema was widened', () => {
    const definition = workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
    })
    const legacy = {
      ...definition,
      steps: Object.fromEntries(
        Object.entries(definition.steps).map(([id, step]) => [id, stripped(step)]),
      ),
    }

    expect(predatesWidenedSchema(legacy)).toBe(true)
    // and the reason it matters: the row kept no edges at all
    expect(Object.values(legacy.steps).every(step => Object.keys(step.input_connections as object).length === 0)).toBe(true)
  })

  it('leaves a definition Galaxy really produced alone', () => {
    // Every export step carries `position`, and every one Galaxy wrote also
    // carries `errors` — both outside the fourteen keys the old schema kept.
    expect(predatesWidenedSchema(workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
    }))).toBe(false)
  })

  it('does not flag one step of many as enough', () => {
    // A definition is stored whole or not at all, so one step carrying a
    // widened key says the row was written by the widened schema.
    const definition = workflowDefinition({
      0: dataInputStep(0, 'Reads'),
      1: toolStep(1, FOO, '1.2.3+galaxy0'),
    })
    const half = {
      ...definition,
      steps: { 0: stripped(definition.steps['0']!), 1: definition.steps['1']! },
    }

    expect(predatesWidenedSchema(half)).toBe(false)
  })

  it('does not flag a definition with no steps, which has no edge to have lost', () => {
    expect(predatesWidenedSchema(workflowDefinition({}))).toBe(false)
  })

  it('does not flag something that is not a definition at all', () => {
    expect(predatesWidenedSchema(null)).toBe(false)
    expect(predatesWidenedSchema({})).toBe(false)
    expect(predatesWidenedSchema({ steps: null })).toBe(false)
  })
})
