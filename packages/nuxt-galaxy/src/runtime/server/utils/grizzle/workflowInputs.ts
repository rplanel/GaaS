/**
 * The inputs a stored workflow definition declares, read off the definition
 * this server already holds.
 */
import type { WorkflowStepType } from 'blendtype'
import { Data, Effect } from 'effect'

/**
 * The datamap cannot start the workflow it names.
 *
 * The caller's own mistake and the only thing on this path they can fix
 * themselves, so it is told apart from the rest and answered with a 400. It
 * is raised before anything is prepared, which is what makes it a refusal
 * rather than a failure with an analysis to unwind.
 */
export class DatamapMismatchError extends Data.TaggedError('DatamapMismatchError')<{
  readonly message: string
}> {}

/** One dataset input the workflow declares, named as a datamap names it. */
export interface DeclaredInput {
  /**
   * The step's key in the definition, which is also the key a datamap uses:
   * Galaxy resolves an invocation's `inputs` by `step_index|step_uuid` when
   * the request names no `inputs_by`, and `blendtype`'s `invokeWorkflowEffect`
   * names none. The export format keys its steps by that same index, so the
   * two shapes line up key for key with nothing to translate.
   */
  readonly step: string
  /** What the workflow calls this input, when its author named it. */
  readonly label: string | null
  /** Whether Galaxy would run the workflow without it. */
  readonly optional: boolean
}

/**
 * The step types that carry a dataset, and therefore the ones a datamap is
 * answerable for.
 *
 * Galaxy's own `INPUT_STEP_TYPES` also lists `parameter_input`, but a
 * parameter is not a dataset and travels in the request's separate
 * `parameters` field, so a datamap entry against one is not an input being
 * supplied.
 */
const DATASET_INPUT_TYPES: ReadonlySet<WorkflowStepType> = new Set<WorkflowStepType>([
  'data_input',
  'data_collection_input',
])

/**
 * The set again, widened for looking a `json` column's value up in it.
 *
 * The declaration above is typed against `blendtype`'s own union so that a
 * typo in a member is a compile error; what arrives here is an unvalidated
 * `string`, so the lookup is widened deliberately rather than by accident.
 */
const DATASET_INPUT_TYPE_NAMES = DATASET_INPUT_TYPES as ReadonlySet<string>

/**
 * Whether Galaxy would let this step go unsupplied.
 *
 * `tool_state` is a JSON *string* in the export format, and the flag inside it
 * is what Galaxy's `WorkflowStep.input_optional` reads. Anything unparseable
 * counts as required, which is the safe direction: it refuses a request this
 * server cannot vouch for rather than passing it on.
 */
function isOptional(step: Record<string, unknown>): boolean {
  const toolState = step.tool_state
  if (typeof toolState !== 'string') {
    return false
  }
  try {
    const parsed: unknown = JSON.parse(toolState)
    if (parsed === null || typeof parsed !== 'object') {
      return false
    }
    // Galaxy reads this as `tool_state.get('optional') or False`, so any
    // falsy value means required rather than only a literal `false`.
    return Boolean((parsed as { optional?: unknown }).optional)
  }
  catch {
    return false
  }
}

function labelOf(step: Record<string, unknown>): string | null {
  const label = step.label
  return typeof label === 'string' && label.trim().length > 0 ? label : null
}

/**
 * The definition's steps, or `null` when there is no reading them.
 *
 * `definition` is a `json` column Drizzle does not type, holding whatever
 * Galaxy exported when the version was published, so "declares no inputs"
 * and "cannot be read at all" are two different answers and only one of them
 * is a reason to refuse anything.
 */
function stepsOf(definition: unknown): Record<string, unknown> | null {
  const steps = definition !== null && typeof definition === 'object'
    ? (definition as { steps?: unknown }).steps
    : undefined
  return steps !== null && typeof steps === 'object' ? steps as Record<string, unknown> : null
}

/**
 * Every dataset input the definition declares, in step order.
 *
 * A definition this cannot read declares nothing — which is not the same as
 * a definition that declares nothing. `datamapMismatchReason` tells the two
 * apart; this does not, so nothing should refuse on its emptiness alone.
 */
export function declaredInputs(definition: unknown): DeclaredInput[] {
  const steps = stepsOf(definition)
  if (steps === null) {
    return []
  }

  return Object.entries(steps)
    .filter((entry): entry is [string, Record<string, unknown>] => {
      const [, step] = entry
      return step !== null && typeof step === 'object'
    })
    .filter(([, step]) => typeof step.type === 'string' && DATASET_INPUT_TYPE_NAMES.has(step.type))
    .map(([key, step]) => ({
      step: key,
      label: labelOf(step),
      optional: isOptional(step),
    }))
    .sort((a, b) => byStepIndex(a.step, b.step))
}

/**
 * How a single input reads in something a caller is told.
 *
 * Its label and nothing else, because the label is the word the reader has
 * already seen: it is what the form puts beside the field they did not fill
 * in. A step index is precise but refers to nothing they can see — it appears
 * nowhere in the interface — so it is kept for the one case with no label to
 * use instead, where naming the input badly beats not naming it at all.
 *
 * The undeclared-step clause below still carries the index. There is no label
 * to reach for when the step is not a declared input, and nothing the form
 * sends can land there: only a caller writing datamaps itself reaches that
 * message, and an index is what such a caller keyed the datamap by.
 */
function nameOf(input: DeclaredInput): string {
  return input.label === null
    ? `at step ${input.step}`
    : `"${input.label}"`
}

/**
 * Step keys in index order.
 *
 * Both shapes key by the step's index, but this reads a `json` column and a
 * request body rather than anything that enforces it, so a key that is not a
 * number falls back to comparing as text instead of handing `sort` a `NaN` it
 * would order arbitrarily.
 */
function byStepIndex(a: string, b: string): number {
  const left = Number(a)
  const right = Number(b)
  return Number.isNaN(left) || Number.isNaN(right)
    ? a.localeCompare(b)
    : left - right
}

/**
 * Why this datamap cannot start this workflow, or `null` when it can.
 *
 * The comparison runs in both directions. An input left out is the case #43
 * names: Galaxy answers that 400 itself, from `_normalize_inputs`, so
 * refusing it here only moves an answer the caller was always going to get to
 * before anything has been created.
 *
 * An entry naming a step the workflow does not declare is refused too, which
 * is a deliberate departure from Galaxy: `_normalize_inputs` walks the
 * workflow's steps and never looks at the keys it was not asked about, so an
 * extra one costs Galaxy nothing. It is not free here. Every datamap key is
 * uploaded by `uploadDatasetsEffect` before Galaxy sees the invocation, so an
 * extra one buys a dataset in the history and an analysis whose recorded
 * datamap names an input that never ran. Nothing legitimate sends one: the
 * form's schema is built from the inputs the workflow declares and `z.object`
 * keeps nothing else.
 *
 * A definition with no readable steps is not refused at all. Refusing needs
 * this server to know what the workflow asks for, and the whole argument for
 * the guard is that it already does; where it does not, it has no grounds to
 * answer for the request and leaves it exactly where it was before.
 */
export function datamapMismatchReason(
  definition: unknown,
  datamap: Record<string, unknown> | null | undefined,
): string | null {
  if (stepsOf(definition) === null) {
    return null
  }

  const declared = declaredInputs(definition)
  const provided = new Set(Object.keys(datamap ?? {}))
  const declaredSteps = new Set(declared.map(input => input.step))

  const missing = declared.filter(input => !input.optional && !provided.has(input.step))
  const undeclared = [...provided].filter(step => !declaredSteps.has(step)).sort(byStepIndex)

  // Each clause is written to read mid-sentence, so that a datamap with both
  // problems is told about them in one message rather than one per round
  // trip. Whichever comes first is capitalised on the way out.
  const problems: string[] = []
  if (missing.length > 0) {
    const noun = missing.length === 1 ? 'input' : 'inputs'
    problems.push(`no dataset was provided for the ${noun} ${missing.map(nameOf).join(', ')}`)
  }
  if (undeclared.length > 0) {
    // "no *dataset* input", because a step the datamap named may well be
    // declared — a `parameter_input` is an input by Galaxy's reckoning, and a
    // tool step exists too. What none of them take is a dataset, which is the
    // only thing a datamap supplies.
    const noun = undeclared.length === 1 ? 'step' : 'steps'
    problems.push(`this workflow declares no dataset input at ${noun} ${undeclared.join(', ')}`)
  }
  if (problems.length === 0) {
    return null
  }

  const message = problems.join('; ')
  return message.charAt(0).toUpperCase() + message.slice(1)
}

/**
 * Refuse a datamap that cannot start the workflow it names.
 *
 * The failure is built here rather than at the call site because this is the
 * place with the reason: ADR 0002 turns down "keep the nullables and fold them
 * in the handler" on exactly that ground, and every sibling guard —
 * `getWorkflowEffect`, `addHistoryEffect` — fails at the leaf the same way.
 */
export function requireDatamapDeclaresInputs(
  definition: unknown,
  datamap: Record<string, unknown> | null | undefined,
): Effect.Effect<void, DatamapMismatchError> {
  const reason = datamapMismatchReason(definition, datamap)
  return reason === null
    ? Effect.void
    : Effect.fail(new DatamapMismatchError({ message: reason }))
}
