import type { WorkflowStepExport } from 'blendtype'
import { describe, expect, it } from 'vitest'
import { datamapMismatchReason, declaredInputs } from '../../../../src/runtime/server/utils/grizzle/workflowInputs'
import { dataInputStep, workflowDefinition as definitionWithSteps } from '../../workflowDefinition'

describe('declaredInputs', () => {
  it('reads a dataset input off the step key a datamap uses, by `type`', () => {
    const definition = definitionWithSteps({
      0: dataInputStep(0, 'Input FASTQ'),
    })

    expect(declaredInputs(definition)).toEqual([
      { step: '0', label: 'Input FASTQ', optional: false },
    ])
  })

  it('ignores `step_type`, which the stored definition never carries', () => {
    // The shape the ticket assumed: `step_type` belongs to the `style=run`
    // export, and a definition keyed that way declares nothing here. If this
    // ever starts failing, the column's contents changed and the field this
    // reads has to change with it.
    const definition = definitionWithSteps({
      0: { ...dataInputStep(0, 'Input FASTQ'), type: undefined, step_type: 'data_input' } as unknown as WorkflowStepExport,
    })

    expect(declaredInputs(definition)).toEqual([])
  })

  it('declares a collection input alongside a plain dataset input', () => {
    const definition = definitionWithSteps({
      0: dataInputStep(0, 'Input FASTQ'),
      1: dataInputStep(1, 'Input collection', { type: 'data_collection_input' }),
    })

    expect(declaredInputs(definition).map(input => input.step)).toEqual(['0', '1'])
  })

  it('declares nothing for the steps that carry no dataset', () => {
    // A tool step is not an input, and a parameter travels in the request's
    // own `parameters` field rather than in the datamap.
    const definition = definitionWithSteps({
      0: dataInputStep(0, 'A threshold', { type: 'parameter_input' }),
      1: dataInputStep(1, null, { type: 'tool', tool_id: 'cat1' }),
    })

    expect(declaredInputs(definition)).toEqual([])
  })

  it('reads the optional flag out of the `tool_state` JSON string', () => {
    const definition = definitionWithSteps({
      0: dataInputStep(0, 'Optional extras', { tool_state: '{"optional": true, "tag": null}' }),
    })

    expect(declaredInputs(definition)).toEqual([
      { step: '0', label: 'Optional extras', optional: true },
    ])
  })

  it('treats an unreadable `tool_state` as required', () => {
    const definition = definitionWithSteps({
      0: dataInputStep(0, 'Input FASTQ', { tool_state: 'not json at all' }),
    })

    expect(declaredInputs(definition)[0]?.optional).toBe(false)
  })

  it('returns steps in index order, whatever order the definition lists them', () => {
    const definition = definitionWithSteps({
      10: dataInputStep(10, 'Tenth'),
      2: dataInputStep(2, 'Second'),
    })

    expect(declaredInputs(definition).map(input => input.step)).toEqual(['2', '10'])
  })

  it('declares nothing for a definition it cannot read', () => {
    expect(declaredInputs(undefined)).toEqual([])
    expect(declaredInputs(null)).toEqual([])
    expect(declaredInputs({})).toEqual([])
    expect(declaredInputs({ steps: 'nonsense' })).toEqual([])
  })
})

describe('datamapMismatchReason', () => {
  it('names the input a datamap left out', () => {
    const definition = definitionWithSteps({ 0: dataInputStep(0, 'Input FASTQ') })

    expect(datamapMismatchReason(definition, {})).toBe(
      'No dataset was provided for the input "Input FASTQ"',
    )
  })

  it('names every input a datamap left out', () => {
    const definition = definitionWithSteps({
      0: dataInputStep(0, 'Input FASTQ'),
      1: dataInputStep(1, 'Input reference'),
    })

    expect(datamapMismatchReason(definition, {})).toBe(
      'No dataset was provided for the inputs "Input FASTQ", "Input reference"',
    )
  })

  it('names an unlabelled input by its step alone', () => {
    const definition = definitionWithSteps({ 0: dataInputStep(0, null) })

    expect(datamapMismatchReason(definition, {})).toBe(
      'No dataset was provided for the input at step 0',
    )
  })

  it('accepts a datamap that supplies every input the workflow declares', () => {
    const definition = definitionWithSteps({
      0: dataInputStep(0, 'Input FASTQ'),
      1: dataInputStep(1, 'Input reference'),
    })

    expect(datamapMismatchReason(definition, {
      0: { id: 'ds-0', name: 'a.fastq', storage_object_id: 'so-0' },
      1: { id: 'ds-1', name: 'ref.fa', storage_object_id: 'so-1' },
    })).toBeNull()
  })

  it('accepts an empty datamap for a workflow that declares no inputs', () => {
    expect(datamapMismatchReason(definitionWithSteps({}), {})).toBeNull()
  })

  it('accepts an optional input nobody supplied, as Galaxy would', () => {
    const definition = definitionWithSteps({
      0: dataInputStep(0, 'Optional extras', { tool_state: '{"optional": true, "tag": null}' }),
    })

    expect(datamapMismatchReason(definition, {})).toBeNull()
  })

  it('accepts an optional input somebody did supply', () => {
    const definition = definitionWithSteps({
      0: dataInputStep(0, 'Optional extras', { tool_state: '{"optional": true, "tag": null}' }),
    })

    expect(datamapMismatchReason(definition, {
      0: { id: 'ds-0', name: 'a.fastq', storage_object_id: 'so-0' },
    })).toBeNull()
  })

  it('refuses a datamap naming a step the workflow does not declare', () => {
    // A deliberate departure from Galaxy, argued where it is implemented.
    const definition = definitionWithSteps({ 0: dataInputStep(0, 'Input FASTQ') })

    expect(datamapMismatchReason(definition, {
      0: { id: 'ds-0', name: 'a.fastq', storage_object_id: 'so-0' },
      2: { id: 'ds-2', name: 'stale.fastq', storage_object_id: 'so-2' },
    })).toBe('This workflow declares no dataset input at step 2')
  })

  // The step is declared — Galaxy counts a parameter input among its input
  // steps — so the refusal says no *dataset* input rather than none at all.
  it('refuses a datamap naming a step that carries no dataset', () => {
    const definition = definitionWithSteps({
      0: dataInputStep(0, 'Input FASTQ'),
      1: dataInputStep(1, 'A threshold', { type: 'parameter_input' }),
    })

    expect(datamapMismatchReason(definition, {
      0: { id: 'ds-0', name: 'a.fastq', storage_object_id: 'so-0' },
      1: { id: 'ds-1', name: 'no.fastq', storage_object_id: 'so-1' },
    })).toBe('This workflow declares no dataset input at step 1')
  })

  it('names every undeclared step at once', () => {
    const definition = definitionWithSteps({ 0: dataInputStep(0, 'Input FASTQ') })

    expect(datamapMismatchReason(definition, {
      0: { id: 'ds-0', name: 'a.fastq', storage_object_id: 'so-0' },
      3: { id: 'ds-3', name: 'x', storage_object_id: 'so-3' },
      2: { id: 'ds-2', name: 'y', storage_object_id: 'so-2' },
    })).toBe('This workflow declares no dataset input at steps 2, 3')
  })

  // Both halves of the naming rule in one message: a labelled input is named
  // by its label alone, because that is the word the form showed the reader,
  // while an undeclared step has no label to use and keeps its index.
  it('says both when a datamap misses one input and invents another', () => {
    const definition = definitionWithSteps({ 0: dataInputStep(0, 'Input FASTQ') })

    expect(datamapMismatchReason(definition, {
      2: { id: 'ds-2', name: 'stale.fastq', storage_object_id: 'so-2' },
    })).toBe(
      'No dataset was provided for the input "Input FASTQ"; this workflow declares no dataset input at step 2',
    )
  })

  it('refuses nothing when the definition has no steps it can read', () => {
    // `declaredInputs` answers `[]` for both "declares nothing" and "cannot be
    // read", and only the first is grounds to refuse. Reading the second as
    // the first would turn every key into an undeclared one and refuse every
    // request for that workflow, which is the opposite of standing down.
    const datamap = { 0: { id: 'ds-0', name: 'a.fastq', storage_object_id: 'so-0' } }

    expect(datamapMismatchReason({ steps: 'nonsense' }, datamap)).toBeNull()
    expect(datamapMismatchReason(undefined, datamap)).toBeNull()
    expect(datamapMismatchReason({}, datamap)).toBeNull()
  })

  it('accepts an absent datamap for a workflow that declares no inputs', () => {
    expect(datamapMismatchReason(definitionWithSteps({}), undefined)).toBeNull()
  })

  it('names the inputs an absent datamap leaves out', () => {
    const definition = definitionWithSteps({ 0: dataInputStep(0, 'Input FASTQ') })

    expect(datamapMismatchReason(definition, undefined)).toBe(
      'No dataset was provided for the input "Input FASTQ"',
    )
  })

  it('orders steps that are not numbers instead of leaving them to NaN', () => {
    const definition = definitionWithSteps({ 0: dataInputStep(0, 'Input FASTQ') })

    expect(datamapMismatchReason(definition, {
      0: { id: 'ds-0', name: 'a.fastq', storage_object_id: 'so-0' },
      b: { id: 'ds-b', name: 'b', storage_object_id: 'so-b' },
      a: { id: 'ds-a', name: 'a', storage_object_id: 'so-a' },
    })).toBe('This workflow declares no dataset input at steps a, b')
  })
})
