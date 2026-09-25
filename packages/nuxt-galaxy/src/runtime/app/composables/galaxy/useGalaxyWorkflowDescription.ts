import type { MaybeRefOrGetter } from '#imports'
import type {
  GalaxyDataToolParameter,
  GalaxyTool,
  GalaxyToolParameters,
  WorkflowStep,
  WorkflowToolParameters,
  WorkflowToolStep,
} from 'blendtype'
import type { UnavailableTool } from '../../../types/nuxt-galaxy'
import { computed, toRaw, toValue, watch } from '#imports'
import { useQuery } from '@pinia/colada'
import { log } from 'evlog/client'
import { galaxyWorkflowDescriptionQuery } from '../../queries/galaxy/workflows'

/**
 * A tool parameter the invoke form offers a widget for: everything a tool
 * declares except its `data` parameters.
 *
 * The filter moved here from `useGalaxyTool`, deliberately and unchanged.
 * It is the reason a `data` parameter left as a `RuntimeValue` — one the
 * workflow expects to be supplied at run time — is never asked for, which
 * #86's recordings pinned as today's behaviour. Whether that is right is
 * **#97**; this ticket only had to re-place the filter, not re-decide it.
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
 * asked for none — moves with every save in its editor.
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
  // form and the analysis panel, where there used to be two; a Galaxy
  // outage that empties both screens should leave a trace (LOGGING-SPEC §3).
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

  const workflowSteps = computed<Record<string, WorkflowStep>>(() => toValue(description)?.steps ?? {})
  const workflowInputs = computed(() => toValue(description)?.inputs ?? {})

  /**
   * The steps that run a tool: type `tool`, with both a `tool_id` and a
   * `tool_version`. A data or parameter input carries neither.
   */
  const workflowToolSteps = computed<Record<string, WorkflowToolStep>>(() => {
    const steps = toValue(workflowSteps)
    return Object.entries(steps)
      .filter((entry): entry is [string, WorkflowToolStep] => {
        const [, step] = entry
        return step.type === 'tool' && step.tool_id !== null && step.tool_version !== null
      })
      .reduce<Record<string, WorkflowToolStep>>((acc, [stepId, step]) => {
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

  /** Which tool each tool step runs, by step id. */
  const stepToTool = computed(() => {
    return Object.entries(toValue(workflowToolSteps)).reduce<Record<string, string>>((acc, [stepId, step]) => {
      acc[stepId] = step.tool_id
      return acc
    }, {})
  })

  /**
   * The resolved definitions, by tool id.
   *
   * The endpoint keys them `<toolId>@<version>`, because one workflow can
   * pin the same tool at two versions; the screens look a tool up by the id
   * its step names, so that is the key here.
   *
   * A workflow that really does pin two versions of one tool keeps the last
   * of them, and the step pinned to the other is then offered the wrong
   * version's parameters. That is **#100**, and it is preserved rather than
   * introduced: `useGalaxyTool` keyed by the answer's `id` and collided the
   * same way, and #86's suite pins the behaviour by looking a tool up by
   * bare id. What changed is that the fix became cheap — before #87 the
   * client had no version to key by, and now the endpoint hands it one.
   */
  const toolsObj = computed<Record<string, GalaxyTool>>(() => {
    const tools = toValue(description)?.tools ?? {}
    return Object.entries(tools).reduce<Record<string, GalaxyTool>>((acc, [key, tool]) => {
      acc[key.slice(0, key.lastIndexOf('@'))] = tool
      return acc
    }, {})
  })

  /** The parameters each tool offers a widget for, by tool id. */
  const toolInputParameters = computed(() => {
    return Object.entries(toValue(toolsObj)).reduce<Record<string, ToolInputParameter[]>>((acc, [toolId, tool]) => {
      acc[toolId] = tool.inputs.filter((input): input is ToolInputParameter => input.type !== 'data')
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
    const byPin = new Map(toValue(unavailableTools).map(tool => [`${tool.toolId}@${tool.toolVersion}`, tool]))
    return Object.entries(toValue(workflowToolSteps)).reduce<Record<string, UnavailableTool>>((acc, [stepId, step]) => {
      const tool = byPin.get(`${step.tool_id}@${step.tool_version}`)
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
    isLoading,
    error,
    /**
     * Ask Galaxy again, whatever the cache holds. The answer is cached for
     * ever by design, so this is the only way an unavailable tool that has
     * since been installed, or a Galaxy that has come back, is picked up.
     */
    retry: refetch,
  }
}
