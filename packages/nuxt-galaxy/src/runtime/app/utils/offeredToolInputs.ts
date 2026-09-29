import type { GalaxyDataToolParameter, GalaxyToolParameters } from 'blendtype'
import { DATASET_INPUT_TYPES } from './unconnectedDatasetInputs'

/**
 * A tool parameter the invoke form offers a widget for: everything a tool
 * declares except its dataset inputs, **at every depth**.
 *
 * The filter moved here from `useGalaxyWorkflowDescription` when #101 made it
 * recursive, and it still says what #97 settled: a `data` or `data_collection`
 * parameter of a tool step is fed by an edge — from an upstream tool, or from
 * one of the workflow's own `data_input` steps — and there is nothing for a
 * widget on the step panel to do about it. A data parameter with no edge at
 * all is not this filter's business either; `unconnectedInputsByStep` names
 * those instead.
 */
export type ToolInputParameter = Exclude<GalaxyToolParameters, GalaxyDataToolParameter>

function isOffered(input: GalaxyToolParameters): input is ToolInputParameter {
  return !DATASET_INPUT_TYPES.has(input.type)
}

/**
 * The same judgement one level down, which is the whole of #101's half of the
 * filter.
 *
 * Until this ticket the filter ran over a tool's top-level inputs and stopped
 * there, because nothing rendered a group's children anyway. Now that a
 * section and a repeat render, a dataset input inside one would be offered a
 * widget the top level refuses it — and `unconnectedDatasetInputs`, which does
 * walk to the bottom, would report the same parameter as unconnected in the
 * same panel. `integron_finder`'s `settings|attc_settings|covar_matrix` is
 * exactly that parameter, and #101 kept the two sides one judgement rather
 * than letting the panel say both "you may set this" and "nothing is feeding
 * this".
 *
 * A group left with **nothing** to offer is dropped whole rather than rendered
 * as an empty box: `__MERGE_COLLECTION__`'s `inputs` repeat declares one child
 * and it is a `data_collection`, so there is no form for a reader to fill in
 * and a titled empty block would only suggest otherwise.
 *
 * A conditional keeps every case, and only each case's inputs are filtered:
 * `Conditional.vue` indexes `cases` with the saved `__current_case__`, so
 * dropping a case would silently renumber the rest. A conditional is never
 * dropped for being empty either — its `test_param` is a widget in its own
 * right, and the branch it names is what #94 is about.
 */
export function offeredToolInputs(inputs: readonly GalaxyToolParameters[]): ToolInputParameter[] {
  const offered: ToolInputParameter[] = []
  for (const input of inputs) {
    if (!isOffered(input)) {
      continue
    }
    if (input.type === 'section') {
      const nested = offeredToolInputs(input.inputs)
      if (nested.length > 0) {
        offered.push({ ...input, inputs: nested })
      }
      continue
    }
    if (input.type === 'repeat') {
      const nested = offeredToolInputs(input.inputs)
      if (nested.length > 0) {
        offered.push({ ...input, inputs: nested })
      }
      continue
    }
    if (input.type === 'conditional') {
      offered.push({
        ...input,
        cases: input.cases.map(one => ({ ...one, inputs: offeredToolInputs(one.inputs) })),
      })
      continue
    }
    offered.push(input)
  }
  return offered
}
