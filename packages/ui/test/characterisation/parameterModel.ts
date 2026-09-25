/**
 * The parameter model the invoke form derives, taken apart into the steps a
 * test can assert on (#86).
 *
 * Nothing here is production code and nothing here should become production
 * code by accident. Two of the three derivations below already exist in the
 * application and are exercised through the real composables by the suite;
 * this module holds the *export*-side derivation, which has no production
 * counterpart yet, and the vocabulary both sides are described in.
 *
 * `parameterValuesFromExport` is therefore the contract #88 has to satisfy
 * when it makes the stored definition the source of truth: if reading a
 * workflow from its export produces the model this function produces, the
 * switch changed nothing.
 */

/**
 * Galaxy's own bookkeeping inside a parameter state. `__page__` is a relic of
 * the multi-page tool forms, `__rerun_remap_job_id__` belongs to rerunning a
 * job. Neither is a parameter, neither reaches a reader, and both are in
 * every state Galaxy emits — so comparing states without dropping them means
 * comparing noise.
 */
const BOOKKEEPING = new Set(['__page__', '__rerun_remap_job_id__'])

/**
 * What one parameter value *is*, in the vocabulary the invoke form cares
 * about, rather than what it literally holds.
 *
 * The suite asserts on these and never on raw payload equality: the ticket
 * asks for the derived model precisely because raw dicts differ by key
 * ordering and bookkeeping in ways that never reach a user. A shape, by
 * contrast, changes only when something a reader would notice changes.
 */
export type ParameterShape
  /** A value the reader types or picks. `type` is JavaScript's, which is how the version difference below shows up. */
  = | { kind: 'scalar', type: 'string' | 'number' | 'boolean' | 'null' }
  /**
   * A parameter left to be supplied when the workflow runs. Galaxy writes
   * `{"__class__": "RuntimeValue"}`; the invoke form has to offer it as a
   * field rather than treat it as a value.
   */
    | { kind: 'RuntimeValue' }
  /**
   * A parameter fed by an upstream step's output. Galaxy writes
   * `{"__class__": "ConnectedValue"}`. The design doc never named this one —
   * it is the most common shape in both fixtures and the invoke form must
   * not* offer it as a field, because the graph supplies it.
   */
    | { kind: 'ConnectedValue' }
  /**
   * A conditional: `__current_case__` names which branch of the tool's
   * `cases` is live, and the inputs are that branch's.
   */
    | { kind: 'conditional', currentCase: number, inputs: Record<string, ParameterShape> }
  /**
   * A repeat: a list of blocks, each carrying its own `__index__`. Only the
   * first block's shape is described, with `length` and `uniformKeys`
   * standing in for the rest — a repeat whose blocks disagreed in shape would
   * be the interesting thing, so that is asserted rather than enumerated.
   */
    | { kind: 'repeat', length: number, uniformKeys: boolean, entry: Record<string, ParameterShape> }
  /** A `<section>`, or any other plain nesting that is neither of the two above. */
    | { kind: 'section', inputs: Record<string, ParameterShape> }
  /** A list that is not a repeat. */
    | { kind: 'list', length: number }

function isRepeatBlockList(value: unknown[]): boolean {
  return value.length > 0
    && value.every(entry => entry !== null && typeof entry === 'object' && !Array.isArray(entry))
    && value.some(entry => '__index__' in (entry as Record<string, unknown>))
}

/** The shape of one parameter value, recursing so a conditional inside a repeat is visible. */
export function describeParameterValue(value: unknown): ParameterShape {
  if (Array.isArray(value)) {
    if (!isRepeatBlockList(value)) {
      return { kind: 'list', length: value.length }
    }
    const entries = value as Record<string, unknown>[]
    const keysOf = (entry: Record<string, unknown>) =>
      Object.keys(entry).filter(key => !BOOKKEEPING.has(key) && key !== '__index__').sort().join(',')
    const first = keysOf(entries[0]!)
    return {
      kind: 'repeat',
      length: entries.length,
      uniformKeys: entries.every(entry => keysOf(entry) === first),
      entry: describeParameters(entries[0]!),
    }
  }
  if (value === null) {
    return { kind: 'scalar', type: 'null' }
  }
  if (typeof value !== 'object') {
    return { kind: 'scalar', type: typeof value as 'string' | 'number' | 'boolean' }
  }
  const record = value as Record<string, unknown>
  if (record.__class__ === 'RuntimeValue') {
    return { kind: 'RuntimeValue' }
  }
  if (record.__class__ === 'ConnectedValue') {
    return { kind: 'ConnectedValue' }
  }
  if ('__current_case__' in record) {
    return {
      kind: 'conditional',
      currentCase: Number(record.__current_case__),
      inputs: describeParameters(record),
    }
  }
  return { kind: 'section', inputs: describeParameters(record) }
}

/** Every parameter of one step, by name, with Galaxy's bookkeeping dropped. */
export function describeParameters(values: Record<string, unknown>): Record<string, ParameterShape> {
  const described: Record<string, ParameterShape> = {}
  for (const [name, value] of Object.entries(values)) {
    if (BOOKKEEPING.has(name) || name === '__index__' || name === '__current_case__') {
      continue
    }
    described[name] = describeParameterValue(value)
  }
  return described
}

// --------------------------------------------------------- the two payloads

/** One step of the live payload, as much of it as this module reads. */
interface LiveStep {
  type?: string
  tool_id?: string | null
  tool_version?: string | null
  tool_inputs?: Record<string, unknown>
  input_steps?: Record<string, unknown>
}

/** One step of the stored definition, as much of it as this module reads. */
interface ExportStep {
  type?: string
  tool_id?: string | null
  tool_version?: string | null
  tool_state?: string
  input_connections?: Record<string, unknown>
}

/**
 * The steps the invoke form treats as tool steps, by the test that
 * `useGalaxyWorkflowDescription.workflowToolSteps` applies: type `tool`, with both a
 * tool id and a tool version. A step failing any of the three is not offered
 * parameters at all, so the filter is part of the model.
 */
export function toolStepIds(steps: Record<string, LiveStep | ExportStep>): string[] {
  return Object.entries(steps)
    .filter(([, step]) => step.type === 'tool' && step.tool_id != null && step.tool_version != null)
    .map(([stepId]) => stepId)
    .sort((a, b) => Number(a) - Number(b))
}

/**
 * The parameter values per tool step as the *live* payload carries them.
 *
 * This mirrors `useGalaxyWorkflowDescription.workflowParametersModel`, which is one
 * property read per step: `tool_inputs` is the raw database column, handed
 * back untouched.
 */
export function parameterValuesFromLive(
  workflow: { steps?: Record<string, LiveStep> },
): Record<string, Record<string, ParameterShape>> {
  const steps = workflow.steps ?? {}
  const model: Record<string, Record<string, ParameterShape>> = {}
  for (const stepId of toolStepIds(steps)) {
    model[stepId] = describeParameters(steps[stepId]!.tool_inputs ?? {})
  }
  return model
}

/**
 * The same model, read from the *stored definition* instead.
 *
 * The export carries `tool_state`, a JSON **string** of
 * `state.encode(nested=True)`, where the live payload carries the decoded
 * column. Parsing it is the whole difference — which is the point: if these
 * two models agree, Q12's switch of source is invisible to a reader, and
 * where they disagree is exactly where it is not.
 *
 * A step whose `tool_state` will not parse is recorded as having no
 * parameters rather than throwing: Galaxy dumps "the last known state without
 * modifications" for a tool it no longer holds, and a suite that crashed on
 * that would be pinning less than one that records it.
 */
export function parameterValuesFromExport(
  definition: { steps?: Record<string, ExportStep> },
): Record<string, Record<string, ParameterShape>> {
  const steps = definition.steps ?? {}
  const model: Record<string, Record<string, ParameterShape>> = {}
  for (const stepId of toolStepIds(steps)) {
    const raw = steps[stepId]!.tool_state
    let parsed: Record<string, unknown> = {}
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>
      }
      catch {
        parsed = {}
      }
    }
    model[stepId] = describeParameters(parsed)
  }
  return model
}

// ------------------------------------------------------------- connections

/**
 * One incoming edge, in the one spelling both payloads can be compared in.
 * The export writes `{id, output_name}`, the live payload
 * `{source_step, step_output}` — the same two facts under different names.
 */
export interface Edge {
  fromStep: number
  output: string
}

/**
 * Every incoming edge of every step, by step and then by input name.
 *
 * Both payloads are read through this so the fan-in difference is a
 * difference in the *result* rather than in how the two were read. The export
 * makes an input's value an array when several outputs feed it; the live
 * payload's `input_steps` is built by assigning into a dict in a loop, so it
 * cannot express that at all and the last connection silently wins.
 */
export function edgesOf(
  workflow: { steps?: Record<string, LiveStep & ExportStep> },
): Record<string, Record<string, Edge[]>> {
  const byStep: Record<string, Record<string, Edge[]>> = {}
  for (const [stepId, step] of Object.entries(workflow.steps ?? {})) {
    const connections = step.input_connections ?? step.input_steps ?? {}
    const byInput: Record<string, Edge[]> = {}
    for (const [inputName, value] of Object.entries(connections)) {
      const many = Array.isArray(value) ? value : [value]
      byInput[inputName] = many.map((one) => {
        const edge = one as Record<string, unknown>
        return {
          fromStep: Number(edge.id ?? edge.source_step),
          output: String(edge.output_name ?? edge.step_output),
        }
      })
    }
    if (Object.keys(byInput).length > 0) {
      byStep[stepId] = byInput
    }
  }
  return byStep
}

// ------------------------------------------------------------- what renders

/**
 * The parameters a step's panel actually puts on screen.
 *
 * `Step.vue` renders one widget per entry of the tool's parameter list, but
 * only where the step's own model holds a value under that name:
 *
 *     v-for="toolInput in toolParameters"
 *     v-if="workflowParametersModel && toolInput.name in workflowParametersModel"
 *
 * So the rendered set is the **intersection** of what the tool declares and
 * what the workflow saved, and the composable has already dropped every
 * `data` parameter from the first of those. That intersection is the model
 * this suite exists to pin: it is what changes if either side changes, and
 * neither payload alone can show it.
 */
export function renderedParameterNames(
  toolInputNames: string[],
  stepParameters: Record<string, ParameterShape>,
): string[] {
  return toolInputNames.filter(name => name in stepParameters)
}
