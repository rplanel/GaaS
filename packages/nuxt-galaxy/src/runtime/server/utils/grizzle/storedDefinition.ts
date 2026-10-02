import type { GalaxyWorkflowExport, WorkflowStepConnections, WorkflowStepExport, WorkflowStepType, WorkflowSubworkflowExport, WorkflowToolParameters } from 'blendtype'
import { inputStepLabel, isInputStep } from '../../../shared/stepLabel'

/**
 * One step of a revision, as this application describes it (#88).
 *
 * The one shape for one thing the design doc asked for. Before this the
 * client read the live API's step and the server the export's, and nothing
 * normalised between them; the two disagree about almost every field name
 * and, worse, about what can be said at all — the live payload cannot
 * express an input fed by two outputs.
 *
 * Named after the live payload wherever both can say the same thing, because
 * that is the spelling the screens already read: `tool_inputs` rather than
 * `tool_state` (decoded, since the export carries it as a JSON string), and
 * `annotation` empty-as-`null`.
 *
 * `input_connections` is the export's own spelling, and deliberately not the
 * live payload's `input_steps`. Galaxy builds `input_steps` by assigning into
 * a dict keyed by input name in a loop (`managers/workflows.py`, both 22.05
 * and 26.1), so an input fed by two upstream outputs keeps the last
 * connection and loses the rest with nothing to show for it. The export keys
 * the same thing by input name with a value that is one connection **or an
 * array of them**, which is the fact a graph is drawn from.
 *
 * What is kept in the row but deliberately left out of this shape:
 * `position` (Q6 auto-lays the graph out), `when`, `workflow_outputs`,
 * `tool_shed_repository` and `post_job_actions`. Nothing reads them yet, and
 * the contract widens when a reader appears — which is what happened to
 * `subworkflow` in #89.
 */
export interface DescribedStep {
  /** The step's `order_index`: the key of `steps`, the `id` a connection names, and a job row's `step_id`. */
  readonly id: number
  readonly type: WorkflowStepType
  /** What the author called the step in the editor, `null` for one they never named. */
  readonly label: string | null
  readonly uuid: string
  readonly annotation: string | null
  readonly tool_id: string | null
  readonly tool_version: string | null
  /** The values the revision was saved with, decoded from the export's `tool_state`. */
  readonly tool_inputs: WorkflowToolParameters
  /** Every incoming edge, by the name of the input it feeds; one or several per input. */
  readonly input_connections: WorkflowStepConnections
  /**
   * Every default the **workflow** gives a step input, by the prefixed name
   * of the input it fills: the export's `in`, unwrapped from its
   * `{ "default": … }` (#105). Empty for a step that sets none, which is
   * nearly every step.
   *
   * From 23.2 Galaxy fills an input nothing connects from this before leaving
   * it empty (`replacement_for_input`, `workflow/run.py:491` at 26.1), so an
   * input named here is not one nothing will supply.
   * A default the **tool** declares on a data parameter is a different thing
   * and is not here: no payload this application reads carries it.
   */
  readonly input_defaults: Readonly<Record<string, unknown>>
  /**
   * The outputs the step declares, which is what an output handle can be
   * drawn for. The live payload has no such list at all.
   *
   * **Empty on a subworkflow step**, even one something downstream reads
   * from: Galaxy writes `outputs: []` there and names the real outputs in
   * `workflow_outputs` instead (measured on `subworkflow-nested`). So an
   * incoming connection can name an `output_name` that appears in no
   * upstream step's `outputs`. Nothing is wrong with the edge — the graph
   * draws one source handle per node rather than one per output — but
   * anything that enumerates handles per output has to know.
   */
  readonly outputs: { readonly name: string, readonly type: string }[]
  /**
   * The workflow a `subworkflow` step runs, normalised the same way its
   * parent is, or `null` on every other step type (#89).
   *
   * Here because the graph draws a subworkflow as **one** node and, when a
   * reader opens that node, draws the nested definition's own shape — never
   * expanded inline (Q19). The nested export is the only description of the
   * subworkflow there is: it carries a `uuid` and a `name` but no stored
   * workflow id, so there is nothing else to look up and nothing to fetch.
   */
  readonly subworkflow: DescribedSubworkflow | null
}

/**
 * The workflow a `subworkflow` step runs, as this application describes it.
 *
 * Its `steps` are `DescribedStep`s like any others, and may hold a further
 * subworkflow step of their own — `subworkflow-nested` is recorded two levels
 * deep for exactly that reason. It is **not** a revision: the nested export
 * carries no `version`, so nothing can be pinned to it and no invocation can
 * run it on its own.
 *
 * Two fields, because two have readers. The nested export also carries a
 * `uuid`, an `annotation`, tags and a creator; they stay in the row and out
 * of this contract until something reads them, as `position` and `when` do.
 */
export interface DescribedSubworkflow {
  /**
   * What the subworkflow is called, or `null` for a nested export that does
   * not say. Needed because the step's own `label` is `null` for a
   * subworkflow node the author never named, and then this is the only name
   * there is to draw on it.
   */
  readonly name: string | null
  readonly steps: Record<string, DescribedStep>
}

/** A step that runs a tool, which is the only kind offered parameters. */
export interface DescribedToolStep extends DescribedStep {
  readonly type: 'tool'
  readonly tool_id: string
  readonly tool_version: string
}

/**
 * One input the revision declares, in the spelling `GET /api/workflows/{id}`
 * answers with, so that the datamap the invoke form builds is keyed as it
 * always was: by the input step's index.
 */
export interface DescribedWorkflowInput {
  readonly label: string
  /** Always empty, as Galaxy's own reading of it is. It is the reader who supplies a value. */
  readonly value: string
  readonly uuid: string
}

/**
 * The step keys the export schema kept **before** it was widened (#82).
 *
 * It was parsed with `.passthrough()` on the outer object only, which does
 * not reach the nested step schema, so a step was stripped to exactly these
 * fourteen keys on the way into the row — and `input_connections` was
 * modelled as one optional key literally named `input`, which no real
 * workflow uses, so it landed as `{}` and the row described a set of steps
 * with nothing joining them.
 *
 * Kept here as the fingerprint of such a row, and nothing else reads it.
 */
const PRE_WIDENING_STEP_KEYS: ReadonlySet<string> = new Set([
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

/**
 * Whether a stored definition was written by the schema that stripped it
 * (#82), rather than by the one that keeps what a definition is for.
 *
 * Such a row still parses — the stripped shape is a subset of the widened
 * one — so it cannot be told apart by parsing, only by what is missing. The
 * test is that **no** step carries a key outside the fourteen the old schema
 * kept. Galaxy writes `errors` and `position` on every step of every export,
 * on 22.05 and on 26.1 alike (`_workflow_to_dict_export`, unconditional
 * except for a subworkflow step, which this schema refuses anyway), so a
 * definition Galaxy really produced always carries something outside that
 * set. Read the other way round: a whole definition of which nothing is
 * outside it was not stored whole.
 *
 * A definition with no steps at all is not flagged: there is no edge to have
 * lost and nothing to draw wrongly.
 *
 * Only the fingerprint is here. What to do about it belongs to the caller —
 * there is no production data yet, so the remedy is to republish the version
 * (ADR 0004), never to migrate the row.
 */
export function predatesWidenedSchema(definition: unknown): boolean {
  const steps = (definition as { steps?: unknown } | null)?.steps
  if (steps === null || typeof steps !== 'object') {
    return false
  }
  const values = Object.values(steps as Record<string, unknown>)
  if (values.length === 0) {
    return false
  }
  return values.every(step =>
    step !== null
    && typeof step === 'object'
    && Object.keys(step).every(key => PRE_WIDENING_STEP_KEYS.has(key)),
  )
}

/**
 * The values one step was saved with, decoded from the export's `tool_state`.
 *
 * A state that will not parse reads as no parameters rather than failing the
 * whole revision: Galaxy dumps "the last known state without modifications"
 * for a tool it no longer holds, and a step whose parameters cannot be read
 * is one panel a reader cannot edit, not a workflow nobody can open. #86's
 * export-side derivation makes the same choice, and this is the contract it
 * pinned.
 */
function toolInputsOf(step: WorkflowStepExport): WorkflowToolParameters {
  if (typeof step.tool_state !== 'string') {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(step.tool_state)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as WorkflowToolParameters
      : {}
  }
  catch {
    return {}
  }
}

/**
 * The defaults the workflow gives this step's inputs, from the export's `in`.
 *
 * `_workflow_to_dict_export` writes `in[name] = {"default": value}` for each
 * step input whose default is set, and leaves the key out otherwise
 * (`managers/workflows.py:1815-1821` at 26.1). Read structurally, since the
 * step schema keeps `in` without modelling it: an entry not of that shape is
 * one this function did not model, and is left out rather than guessed at.
 */
function inputDefaultsOf(step: WorkflowStepExport): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  const stepIn = 'in' in step ? step.in : undefined
  if (stepIn === null || typeof stepIn !== 'object' || Array.isArray(stepIn)) {
    return defaults
  }
  for (const [name, entry] of Object.entries(stepIn)) {
    if (entry !== null && typeof entry === 'object' && 'default' in entry) {
      defaults[name] = entry.default
    }
  }
  return defaults
}

/**
 * The workflow a `subworkflow` step embeds, normalised, or `null` for a step
 * that embeds none.
 *
 * Recursive, because a subworkflow's own steps may hold another subworkflow
 * step: `describedStepsOf` calls back into this for each of them. The
 * recursion terminates on Galaxy's own export, which is built the same way
 * and so cannot be deeper than Galaxy could serialise.
 */
function describedSubworkflowOf(nested: WorkflowSubworkflowExport | null | undefined): DescribedSubworkflow | null {
  if (nested === null || nested === undefined) {
    return null
  }
  return {
    // Empty-as-`null`, as a step's own annotation is: one spelling for "the
    // author wrote nothing here" across the whole contract, and one branch
    // for a nested export that names itself with `''` and one that omits the
    // key altogether.
    name: nested.name === undefined || nested.name === '' ? null : nested.name,
    steps: describedStepsOf(nested),
  }
}

/**
 * Every step of a stored definition, normalised, keyed by `order_index` as
 * the export keys them.
 *
 * Takes only the `steps` of a definition rather than the whole of one,
 * because a nested subworkflow export is the same shape **minus `version`**
 * and has to go through the same normaliser. Every whole export satisfies
 * this too, so no caller changed.
 */
export function describedStepsOf(definition: Pick<GalaxyWorkflowExport, 'steps'>): Record<string, DescribedStep> {
  const described: Record<string, DescribedStep> = {}
  for (const [stepId, step] of Object.entries(definition.steps ?? {})) {
    described[stepId] = {
      id: step.id,
      type: step.type,
      label: step.label ?? null,
      uuid: step.uuid,
      // The export writes the empty string for a step nobody annotated;
      // the live payload wrote `null`, and that is the spelling the type
      // the screens read promises.
      annotation: step.annotation === '' ? null : step.annotation,
      tool_id: step.tool_id,
      // `?? null` because the export leaves the key **out** of a subworkflow
      // step rather than writing `null`, and this contract promises one
      // spelling for absent. `tool_id` needs no such treatment: Galaxy does
      // write that one, as `null` (#89).
      tool_version: step.tool_version ?? null,
      tool_inputs: toolInputsOf(step),
      input_connections: step.input_connections ?? {},
      input_defaults: inputDefaultsOf(step),
      outputs: step.outputs ?? [],
      subworkflow: describedSubworkflowOf(step.subworkflow),
    }
  }
  return described
}

/**
 * The inputs the revision declares, derived exactly as Galaxy derives them
 * for `GET /api/workflows/{id}`: its input steps, keyed by `order_index`,
 * labelled by the author's own label, else by the `name` in the step's saved
 * state, else by what the type is called.
 *
 * Re-derived here rather than read from the live payload because the stored
 * definition is now the source (#88) and it carries no `inputs` list — the
 * export is the workflow, not a reading of it. The three default labels and
 * the order of the fallbacks are Galaxy's own and live in
 * `shared/stepLabel`, because the graph has to label the same steps as nodes
 * — including the input steps of a nested subworkflow, for which no `inputs`
 * list is derived at all (#89).
 */
export function describedInputsOf(steps: Record<string, DescribedStep>): Record<string, DescribedWorkflowInput> {
  const inputs: Record<string, DescribedWorkflowInput> = {}
  for (const step of Object.values(steps)) {
    if (!isInputStep(step)) {
      continue
    }
    inputs[String(step.id)] = {
      label: inputStepLabel(step),
      value: '',
      uuid: step.uuid,
    }
  }
  return inputs
}
