import type { WorkflowConditionalParametersValue, WorkflowParameterValue, WorkflowRepeatInstanceValue, WorkflowToolParameters } from 'blendtype'
import type { MaybeRef } from 'vue'
import type { EncodedGalaxyWorkflowParameter } from './types'
import { isWorkflowRepeatInstanceValue } from 'blendtype'
import { computed, toValue } from 'vue'
import { isConditional, isPresent, splitKey, splitRepeatInstanceKey } from './parameterValue'

/**
 * Put one stored value back where its name says it belongs.
 *
 * The walk down the parents nests each level **inside the one above**. It
 * used to write every level at the step root instead, so
 * `advanced|conflict|duplicate_options` came back as `advanced: {}` beside
 * `conflict: { duplicate_options }` and the inner bag was lost from its
 * parent (#98). Unreachable while the encoder joined at most one level;
 * reachable the moment #101 made a section render, since a section is the
 * first thing to write a three-segment name.
 *
 * Whether a bag already sits at a name is asked with `isConditional`, not
 * with truthiness: a falsy scalar parked there would otherwise read as
 * "nothing here", and the same fault would survive inside the fix for it.
 */
function nestInto(step: WorkflowToolParameters, name: string, value: WorkflowParameterValue): void {
  const path = splitKey(name)
  const leaf = path[path.length - 1]
  if (leaf === undefined) {
    return
  }
  let bag: WorkflowToolParameters | WorkflowConditionalParametersValue = step
  for (const segment of path.slice(0, -1)) {
    if (!isConditional(bag[segment])) {
      bag[segment] = {}
    }
    bag = bag[segment] as WorkflowConditionalParametersValue
  }
  bag[leaf] = value
}

/**
 * Read `parent_0`, `parent_1`, … back into the list of instances they came
 * from (#101).
 *
 * The one step of the way back that has to *decide* rather than merely
 * reverse. A name is ambiguous here — `datasets_0` is one block of a repeat
 * called `datasets`, and it is also a legal name for a conditional or a
 * section. Galaxy never faces the question because it reads the tool's
 * declaration; this side holds only the stored dict, and nothing in it says
 * which a name was.
 *
 * So the encoder sends the answer: every instance carries `__index__`, which
 * names no declared input and which Galaxy overwrites before reading — the
 * same bargain `__current_case__` already had. A bag with the shape of an
 * instance name but no `__index__` is left alone, which is what the
 * conditional called `datasets_0` needs.
 *
 * Order comes from the **position in the name**, never from the `__index__`
 * the value carries. The two agree on any state Galaxy wrote, since every
 * save-time visit renumbers the index to the position; where they disagree,
 * the position is what the encoder will name it by next time, so it is what
 * decides.
 *
 * Depth first, so a repeat nested inside a section is rebuilt before the
 * section around it is examined.
 */
function collapseRepeats(bag: WorkflowToolParameters): WorkflowToolParameters {
  const collapsed: WorkflowToolParameters = {}
  const instances = new Map<string, Map<number, WorkflowRepeatInstanceValue>>()

  for (const [name, value] of Object.entries(bag)) {
    const nested = isConditional(value) ? collapseRepeats(value) : value
    const split = splitRepeatInstanceKey(name)
    // `split.parent in bag` is the last guard: a stored analysis holding both
    // `datasets` and `datasets_0|…` is not one this encoder can produce, and
    // turning the second into a list would silently drop the first.
    if (split !== undefined && isWorkflowRepeatInstanceValue(nested) && !(split.parent in bag)) {
      const byPosition = instances.get(split.parent) ?? new Map<number, WorkflowRepeatInstanceValue>()
      byPosition.set(split.position, nested)
      instances.set(split.parent, byPosition)
      continue
    }
    collapsed[name] = nested
  }

  for (const [parent, byPosition] of instances) {
    collapsed[parent] = [...byPosition.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, instance]) => instance)
  }
  return collapsed
}

export function useGalaxyDecodeParameters(galaxyWorkflowParameters: MaybeRef<EncodedGalaxyWorkflowParameter>) {
  const decodedParameters = computed<Record<string, WorkflowToolParameters>>(() => {
    const galaxyWorkflowParametersVal = toValue(galaxyWorkflowParameters)
    const inputParameters: Record<string, WorkflowToolParameters> = {}
    for (const stepId in galaxyWorkflowParametersVal) {
      const step: WorkflowToolParameters = {}

      for (const paramName in galaxyWorkflowParametersVal[stepId]) {
        const value = galaxyWorkflowParametersVal[stepId][paramName]
        // Which values are dropped is the one thing this has to answer the
        // same way the encoder does, so it asks the same question: only an
        // absence goes. Asked once, before the name is split, because the
        // guard this replaced sat on both branches and refused a falsy value
        // twice — a `0` at the top of a step failed the single-segment test,
        // fell into the nesting branch, and was refused again there (#95).
        if (!isPresent(value)) {
          continue
        }
        nestInto(step, paramName, value)
      }

      inputParameters[stepId] = collapseRepeats(step)
    }
    return inputParameters
  })
  return { decodedParameters }
}
