import type { MaybeRefOrGetter } from '#imports'
import type {
  GalaxyDataToolParameter,
  GalaxyTool,
  GalaxyToolParameters,
  WorkflowToolParameters,
} from 'blendtype'
import type { DescribedStep, DescribedToolStep, UnavailableTool } from '../../../types/nuxt-galaxy'
import type { UnconnectedDatasetInput } from '../../utils/unconnectedDatasetInputs'
import { computed, toRaw, toValue, watch } from '#imports'
import { useQuery } from '@pinia/colada'
import { log } from 'evlog/client'
import { toolKey } from '../../../shared/toolKey'
import { galaxyWorkflowDescriptionQuery } from '../../queries/galaxy/workflows'
import { DATASET_INPUT_TYPES, unconnectedDatasetInputs } from '../../utils/unconnectedDatasetInputs'

/**
 * A tool parameter the invoke form offers a widget for: everything a tool
 * declares except its `data` parameters.
 *
 * The filter moved here from `useGalaxyTool`, deliberately and unchanged, and
 * **#97 settled that it is right**. A data parameter of a tool step is fed by
 * an edge — from an upstream tool, or from one of the workflow's own
 * `data_input` steps — and there is nothing for a widget on the step panel to
 * do about it.
 *
 * What #97 found is that the filter was never the defect. The four
 * `RuntimeValue` data inputs on `ccqtl-wf` step 4 that #86's recordings
 * pinned as unoffered are all four **connected**; the marker is what Galaxy's
 * editor happened to save, not a request for a value. The real gap is a data
 * parameter with no edge at all, which no filter can fix and which
 * `unconnectedInputsByStep` names instead.
 */
export type ToolInputParameter = Exclude<GalaxyToolParameters, GalaxyDataToolParameter>

/**
 * The verdicts that would refuse the submission.
 *
 * Galaxy will not run a revision whose tools are not installed at exactly
 * the versions it pins, so both of these mean the analysis cannot start.
 * `unreachable` is absent on purpose (Q10, Q22): Galaxy may be perfectly
 * well by the time the reader submits, and parameter *values* come from the
 * workflow's saved `tool_inputs` rather than from the definition, so an
 * unreachable tool means a step that cannot be **edited**, not one that
 * would submit wrong.
 */
const BLOCKS_SUBMIT: ReadonlySet<UnavailableTool['reason']> = new Set(['not_installed', 'version_mismatch'])

/**
 * Why a step is marked for a dataset input nothing feeds (#97).
 *
 * The two branches differ because Galaxy's own behaviour does, and **only the
 * optional one is the same on both releases this project meets**:
 *
 * - **Optional.** The step runs with the input empty, on 22.05 and 26.1
 *   alike. So the sentence may promise that the analysis starts, and does.
 * - **Required.** The two releases diverge, and the sentence must not promise
 *   either. `ToolModule.execute` calls `visit_input_values` with
 *   `replace_optional_connections=True`. At 22.05 that branch is guarded by
 *   `hasattr(input, "value")` (`tools/parameters/__init__.py:160`), and a
 *   `DataToolParameter` has no `value` attribute — nothing on the chain from
 *   `ToolParameter` down sets one — so the runtime marker survives,
 *   `from_json` returns `None` for it *before* the required check
 *   (`basic.py:2039`), and the invocation is accepted. By 26.1 that guard is
 *   gone: the marker is replaced with `None`
 *   (`tools/parameters/__init__.py:202-212`), `is_runtime_value(None)` is
 *   false, so `if not value and not self.optional and not self.default_object`
 *   raises `ParameterValueError` (`basic.py:2361`) and **Galaxy refuses the
 *   invocation**.
 *
 * So "the analysis will start, and this step will fail" — what this said
 * first — is true at 22.05 and false at 26.1. "This step cannot run without
 * it" is true on both, and is what a reader can act on either way.
 *
 * The required ones are named rather than folded into the count. "This step
 * cannot run without them" over a list of three, only one of which is
 * required, is wrong about the other two — and the mixed list is the case that
 * actually arises, since a tool with several dataset inputs rarely has them
 * all optional.
 *
 * Neither branch blocks submit, which is still Q10: at 22.05 Galaxy accepts
 * the invocation, so refusing it here would refuse something it would run.
 * When Pasteur moves to 26.x, a *required* unconnected input becomes
 * something Galaxy itself refuses, and blocking it before the datasets are
 * uploaded is then the same argument `blockingTools` already makes. No
 * recorded workflow has one, so that is a decision for the upgrade rather
 * than a guess now.
 */
export function describeUnconnectedDatasetInputs(inputs: UnconnectedDatasetInput[]): string {
  const labelsOf = (subset: UnconnectedDatasetInput[]) => subset.map(input => input.label).join(', ')
  const plural = inputs.length > 1
  const subject = `${labelsOf(inputs)} ${plural ? 'are' : 'is'} set to be supplied when the workflow runs, but nothing is connected to ${plural ? 'them' : 'it'}.`
  const required = inputs.filter(input => !input.optional)
  if (required.length === 0) {
    return `${subject} The analysis will start, and this step will run without ${plural ? 'them' : 'it'}.`
  }
  // Named even when it is the whole list, so the sentence does not change
  // shape between "one required input" and "one of three required".
  return `${subject} This step cannot run without ${labelsOf(required)}.`
}

/** How a tool is named in a sentence a reader has to act on. */
export function describeUnavailableTool(tool: UnavailableTool): string {
  const name = `${tool.toolId} (${tool.toolVersion})`
  switch (tool.reason) {
    case 'not_installed':
      return `${name} is not installed on this Galaxy`
    case 'version_mismatch':
      return `${name} is installed only at ${tool.servedVersion}`
    case 'unreachable':
      return `${name} could not be read from Galaxy`
  }
}

/**
 * One revision of one workflow, and everything the screens derive from it
 * (#87, Q13(b)).
 *
 * One request, over Pinia Colada, keyed to match the server: two screens
 * reading the same revision share one answer, and navigating away and back
 * reuses it rather than refetching. It replaces `useGalaxyWorkflow` and
 * `useGalaxyTool`, which each used raw `$fetch` and so deduplicated nothing.
 *
 * The derivation stays here rather than moving to the server because it maps
 * to Vue components and cannot cross that boundary without being split.
 *
 * `revision` is mandatory, as the endpoint's route is: the revision a
 * workflow row is pinned to is the one an analysis of that row starts (#48),
 * and Galaxy's *latest* revision — what the old composable described when
 * asked for none — moves with every save in its editor. Since #88 the
 * answer comes from the export captured at publish rather than from Galaxy,
 * so what is described is what was published, whatever the editor holds now.
 */
export function useGalaxyWorkflowDescription(
  workflowId: MaybeRefOrGetter<string | undefined>,
  revision: MaybeRefOrGetter<number | undefined>,
) {
  const { data: description, error, isLoading, refetch } = useQuery(() => {
    const workflowIdVal = toValue(workflowId)
    const revisionVal = toValue(revision)
    return {
      ...galaxyWorkflowDescriptionQuery({ workflowId: workflowIdVal ?? '', revision: revisionVal ?? 0 }),
      // Both arrive from the same workflow row, which the screen is still
      // loading on its first render; asking for revision 0 of the empty
      // workflow id would be a 404 cached under a key nothing else reads.
      enabled: workflowIdVal !== undefined && revisionVal !== undefined,
    }
  })

  // This one query is now the single point of failure for both the invoke
  // form and the analysis panel, where there used to be two; an outage that
  // empties both screens should leave a trace (LOGGING-SPEC §3).
  watch(error, (failure) => {
    if (failure) {
      log.warn({
        action: 'workflow:description_failed',
        tag: 'useGalaxyWorkflowDescription',
        workflowId: toValue(workflowId),
        revision: toValue(revision),
        error: String(failure),
      })
    }
  })

  const workflowSteps = computed<Record<string, DescribedStep>>(() => toValue(description)?.steps ?? {})
  const workflowInputs = computed(() => toValue(description)?.inputs ?? {})

  /**
   * The steps that run a tool: type `tool`, with both a `tool_id` and a
   * `tool_version`. A data or parameter input carries neither.
   */
  const workflowToolSteps = computed<Record<string, DescribedToolStep>>(() => {
    const steps = toValue(workflowSteps)
    return Object.entries(steps)
      .filter((entry): entry is [string, DescribedToolStep] => {
        const [, step] = entry
        return step.type === 'tool' && step.tool_id !== null && step.tool_version !== null
      })
      .reduce<Record<string, DescribedToolStep>>((acc, [stepId, step]) => {
        acc[stepId] = step
        return acc
      }, {})
  })

  /**
   * The values the revision was saved with, per step — **copied**, never the
   * cached description's own objects.
   *
   * The invoke form v-models straight into these: `Step.vue` writes
   * `workflowParametersModel[name]` in place. Handed the cached objects, one
   * reader editing a parameter would rewrite what the revision is recorded
   * as having been saved with, for every screen reading that revision and
   * for every later mount — the entry has no expiry, so nothing would ever
   * heal it. The pair of composables this replaced re-fetched per mount, so
   * the same aliasing leaked nothing beyond one screen; sharing the answer
   * is what makes the copy necessary.
   */
  const workflowParametersModel = computed(() => {
    return Object.entries(toValue(workflowToolSteps)).reduce<Record<string, WorkflowToolParameters>>((acc, [stepId, step]) => {
      acc[stepId] = structuredClone(toRaw(step.tool_inputs))
      return acc
    }, {})
  })

  /**
   * Which tool each tool step runs, by step id — named `<toolId>@<version>`,
   * the tool the step itself **pins**.
   *
   * By bare tool id a step resolved to whatever else shared its id (#100). A
   * toolshed guid ends in its own version, so the ids that really do repeat
   * across two versions are the **built-in** ones — `Cut1`,
   * `__BUILD_LIST__`, `Grep1` — and a workflow may pin one of those at two
   * versions in two steps. Both definitions then landed under one key and
   * the last one read won, so both steps were offered that version's form:
   * `Step.vue` renders a parameter only where the step's own saved values
   * have one under that name, so a parameter the step does have went
   * unoffered, and one both versions declare was rendered with the other
   * version's label, bounds and widget.
   */
  const stepToTool = computed(() => {
    return Object.entries(toValue(workflowToolSteps)).reduce<Record<string, string>>((acc, [stepId, step]) => {
      acc[stepId] = toolKey(step.tool_id, step.tool_version)
      return acc
    }, {})
  })

  /**
   * The resolved definitions, keyed as the endpoint keys them:
   * `<toolId>@<version>`.
   *
   * Served through rather than re-keyed. The endpoint has always keyed them
   * by the pin, because one workflow can pin the same tool at two versions;
   * this composable used to throw the version away on the way past, which is
   * where the two definitions collided (#100).
   */
  const toolsObj = computed<Record<string, GalaxyTool>>(() => toValue(description)?.tools ?? {})

  /** The parameters each tool offers a widget for, by the same pin. */
  const toolInputParameters = computed(() => {
    return Object.entries(toValue(toolsObj)).reduce<Record<string, ToolInputParameter[]>>((acc, [key, tool]) => {
      // Read from the same set `unconnectedDatasetInputs` judges by, so the
      // two cannot disagree. Tested as `!== 'data'`, a `data_collection`
      // parameter was offered a widget — which `Step.vue` renders as a blank,
      // since no component is mapped for it — *and* reported as unconnected
      // by the mark, telling the reader both that they may set it and that
      // nothing is feeding it. `data_collection` is absent from
      // `GalaxyToolParameterType`, so the type system had nothing to say.
      acc[key] = tool.inputs.filter((input): input is ToolInputParameter => !DATASET_INPUT_TYPES.has(input.type))
      return acc
    }, {})
  })

  /**
   * The step ids with a data parameter nothing will supply, and which ones
   * (#97) — steps with none are absent rather than present and empty.
   *
   * Galaxy accepts such an invocation and runs the step with the input empty:
   * `DataToolParameter.from_json` returns `None` for a runtime value before it
   * checks whether the parameter is required, so nothing refuses and nothing
   * is said. So this marks the step and does **not** block submit, which is
   * Q10's rule — mark only what would refuse the submission, and this would
   * not refuse it.
   *
   * A step whose tool is unavailable is skipped, not reported clean. Deciding
   * that a parameter is data-typed needs the definition, and there is none;
   * `unavailableByStep` already marks those steps with the reason, so a step
   * is never silently both.
   */
  const unconnectedInputsByStep = computed<Record<string, UnconnectedDatasetInput[]>>(() => {
    const tools = toValue(toolsObj)
    return Object.entries(toValue(workflowToolSteps)).reduce<Record<string, UnconnectedDatasetInput[]>>((acc, [stepId, step]) => {
      const tool = tools[toolKey(step.tool_id, step.tool_version)]
      if (tool === undefined) {
        return acc
      }
      const unsupplied = unconnectedDatasetInputs(tool, step)
      if (unsupplied.length > 0) {
        acc[stepId] = unsupplied
      }
      return acc
    }, {})
  })

  /** Every tool the revision pins that came back as something other than itself. */
  const unavailableTools = computed<UnavailableTool[]>(() => toValue(description)?.unavailable ?? [])

  /**
   * The ones that would refuse the submission, which is what the form marks
   * before submit and refuses on (Q10: mark only what would refuse it).
   */
  const blockingTools = computed(() => toValue(unavailableTools).filter(tool => BLOCKS_SUBMIT.has(tool.reason)))

  /**
   * The step ids whose tool is unavailable, with the reason, so a step can
   * say why it cannot be edited instead of rendering an empty panel — the
   * distinction #96 asked for: a tool that failed is never indistinguishable
   * from a tool that loaded with no parameters.
   */
  const unavailableByStep = computed<Record<string, UnavailableTool>>(() => {
    const byPin = new Map(toValue(unavailableTools).map(tool => [toolKey(tool.toolId, tool.toolVersion), tool]))
    return Object.entries(toValue(workflowToolSteps)).reduce<Record<string, UnavailableTool>>((acc, [stepId, step]) => {
      const tool = byPin.get(toolKey(step.tool_id, step.tool_version))
      if (tool) {
        acc[stepId] = tool
      }
      return acc
    }, {})
  })

  return {
    description,
    workflowSteps,
    workflowInputs,
    workflowToolSteps,
    workflowParametersModel,
    stepToTool,
    toolsObj,
    toolInputParameters,
    unavailableTools,
    blockingTools,
    unavailableByStep,
    unconnectedInputsByStep,
    isLoading,
    error,
    /**
     * Ask the server again, whatever the cache holds. The answer is cached
     * for ever by design, so this is the only way an unavailable tool that
     * has since been installed, or a Galaxy that has come back, is picked
     * up — the revision itself no longer moves at all, since it is read from
     * the export stored at publish (#88).
     */
    retry: refetch,
  }
}
