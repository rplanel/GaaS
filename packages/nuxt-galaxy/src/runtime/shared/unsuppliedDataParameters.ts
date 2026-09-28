import type { GalaxyTool, WorkflowStepConnections, WorkflowToolParameters } from 'blendtype'

/**
 * One data parameter of a tool step that nothing will supply at invoke.
 *
 * `name` is Galaxy's own prefixed name — `settings|attc_settings|covar_matrix`,
 * `datasets_3|input` — because that is the spelling a connection is keyed by,
 * and so the only one the two sides can be compared in.
 */
export interface UnsuppliedDataParameter {
  readonly name: string
  /** What the tool calls it on screen, falling back to its name when it is unlabelled. */
  readonly label: string
  /** Whether Galaxy would run the step without it. */
  readonly optional: boolean
}

/** The parameter types that carry a dataset, and so are fed by an edge rather than typed into a form. */
const DATA_TYPES: ReadonlySet<string> = new Set(['data', 'data_collection'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a saved value is one of the two runtime markers.
 *
 * Both spellings, and deliberately no distinction between them: Galaxy's
 * `is_runtime_value` (`tools/parameters/basic.py:80`, unchanged from 22.05 to
 * 26.1) answers true for `RuntimeValue` and `ConnectedValue` alike, and every
 * data parameter of a stored tool step is one or the other — "All data
 * parameters are represented as runtime values", as `workflow/modules.py:601`
 * puts it. Which spelling gets written is decided at *save* time by
 * `add_dummy_datasets`, so it says nothing about what will happen at run time.
 *
 * That is the correction #97 rests on. The ticket read `RuntimeValue` as
 * "the reader must supply this" and `ConnectedValue` as "an edge supplies
 * this"; the recordings show both markers on both kinds of parameter, and a
 * marker is not what Galaxy consults.
 */
function isRuntimeValue(value: unknown): boolean {
  return isPlainObject(value) && (value.__class__ === 'RuntimeValue' || value.__class__ === 'ConnectedValue')
}

/**
 * Whether an edge feeds this input.
 *
 * This is the whole test, because it is the whole of what Galaxy does:
 * `replacement_for_input` (`workflow/run.py:290`) looks the prefixed name up
 * in `step.input_connections_by_name` and fills the parameter from the
 * upstream output if it is there, leaving the saved value untouched if it is
 * not. A `data_input` step of the workflow is not a separate case — it
 * reaches a tool step through a connection like anything else.
 *
 * An empty array counts as nothing joined. The export models a fan-in as an
 * array under the input's name, so the key existing is not the same as the
 * input being fed.
 */
function isFed(connections: WorkflowStepConnections, prefixedName: string): boolean {
  const connection = connections[prefixedName]
  if (connection === undefined || connection === null) {
    return false
  }
  return Array.isArray(connection) ? connection.length > 0 : true
}

function labelOf(node: Record<string, unknown>, name: string): string {
  const label = node.label
  return typeof label === 'string' && label.trim().length > 0 ? label : name
}

function inputsOf(node: Record<string, unknown>): unknown[] {
  return Array.isArray(node.inputs) ? node.inputs : []
}

/**
 * Walk the **saved state**, using the definition only to resolve what each
 * value is.
 *
 * This direction round is what makes a repeat work. A tool declares one
 * blueprint for its repeat block and the saved state holds however many
 * instances the author added, each with its own `__index__` — which is the
 * number Galaxy's prefixed name carries (`datasets_3|input`). Walking the
 * definition instead would find the blueprint and have no idea how many of it
 * there are.
 *
 * `unknown` rather than `GalaxyToolParameters` for the same reason
 * `withoutDatasetOptions` is structural: a data parameter can sit inside a
 * conditional's case, a repeat block or a section, and only the first of
 * those three is in that union at all.
 */
function walk(
  nodes: unknown[],
  state: unknown,
  prefix: string,
  connections: WorkflowStepConnections,
  found: UnsuppliedDataParameter[],
): void {
  if (!isPlainObject(state)) {
    return
  }
  for (const node of nodes) {
    if (!isPlainObject(node)) {
      continue
    }
    const name = node.name
    const type = node.type
    if (typeof name !== 'string' || typeof type !== 'string') {
      continue
    }
    const value = state[name]

    if (DATA_TYPES.has(type)) {
      const prefixedName = `${prefix}${name}`
      // A value that is not a runtime marker is one this function did not
      // model, and saying nothing is the safe reading of that: the warning
      // exists to name a gap, so inventing one costs more than missing one.
      if (isRuntimeValue(value) && !isFed(connections, prefixedName)) {
        found.push({ name: prefixedName, label: labelOf(node, name), optional: Boolean(node.optional) })
      }
      continue
    }

    if (type === 'section') {
      walk(inputsOf(node), value, `${prefix}${name}|`, connections, found)
      continue
    }

    if (type === 'conditional') {
      // Only the case the revision was saved on. `__current_case__` is the
      // index Galaxy wrote there, and the other cases will not run at all, so
      // reporting a parameter out of one would name a gap that does not exist.
      const cases = Array.isArray(node.cases) ? node.cases : []
      const currentCase = isPlainObject(value) ? value.__current_case__ : undefined
      const chosen = typeof currentCase === 'number' ? cases[currentCase] : undefined
      if (isPlainObject(chosen)) {
        walk(inputsOf(chosen), value, `${prefix}${name}|`, connections, found)
      }
      continue
    }

    if (type === 'repeat') {
      if (!Array.isArray(value)) {
        continue
      }
      for (const instance of value) {
        if (!isPlainObject(instance)) {
          continue
        }
        // The index the instance carries, never its position in the array:
        // Galaxy keys the connection by `__index__`, and a repeat whose
        // middle entry was deleted keeps the gap in its indices.
        const index = instance.__index__
        if (typeof index !== 'number') {
          continue
        }
        walk(inputsOf(node), instance, `${prefix}${name}_${index}|`, connections, found)
      }
    }
  }
}

/**
 * The data parameters of one tool step that nothing will supply (#97).
 *
 * A data parameter of a tool step is filled by an edge — from an upstream
 * tool, or from one of the workflow's own `data_input` steps — and never by
 * anything the invoke form could offer. So a data parameter with no edge is
 * one the analysis will run without, and Galaxy says nothing about it:
 * `DataToolParameter.from_json` returns `None` for a runtime value
 * (`tools/parameters/basic.py:2039`) **before** it checks whether the
 * parameter is required, so the invocation is accepted and the tool runs with
 * the input empty.
 *
 * That silence is what this is for. It is not a submission blocker: the
 * invocation is valid and Galaxy will run it, which is why the form marks the
 * step rather than refusing (Q10 — mark only what would refuse it, and this
 * would not).
 *
 * Every one of the recordings' own cases is settled by the edge and not by
 * the marker: `ccqtl-wf` step 4 carries four `RuntimeValue` data inputs and
 * four connections, so it reports nothing, while `integron_finder` step 1
 * carries `topology_file` with no edge, and `__BUILD_LIST__` step 2 keeps
 * five repeat entries against three connections.
 */
export function unsuppliedDataParameters(
  tool: GalaxyTool,
  step: { readonly tool_inputs: WorkflowToolParameters, readonly input_connections: WorkflowStepConnections },
): UnsuppliedDataParameter[] {
  const found: UnsuppliedDataParameter[] = []
  walk(tool.inputs ?? [], step.tool_inputs, '', step.input_connections ?? {}, found)
  return found
}
