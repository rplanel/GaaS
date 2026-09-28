import type { GalaxyTool } from 'blendtype'
import type { UnavailableTool } from 'nuxt-galaxy'
import { UApp } from '#components'
import { SUPABASE_ANALYSES_QUERY_KEYS } from '#imports'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { useQueryCache } from '@pinia/colada'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import AnalysisHistoryPanel from '../../app/components/analysis/AnalysisHistoryPanel.vue'

/** The Galaxy identifier of the stored workflow every analysis here ran. */
const GALAXY_WORKFLOW_ID = 'galaxy-wf-1'
/** The Galaxy revision the workflow row is pinned to, its `revision` column. */
const PINNED_REVISION = 5
/** The revision analysis 7 was started against and recorded (#48), a later save having moved the row on since. */
const RAN_REVISION = 3

/** The revisions the panel asked Galaxy to describe, in the order it asked. */
let describedRevisions: number[] = []
/** The tool the one step of the described revision runs. */
const TOOL = { id: 'toolshed.g2.bx.psu.edu/repos/iuc/seqtk/seqtk_seq/1.3', version: '1.3' }
/** The tools the description reports as unusable, and why. */
let unavailableTools: UnavailableTool[] = []

mockNuxtImport('useSupabaseClient', () => () => ({} as never))
/** The panel's realtime subscriptions play no part here; none reaches Supabase. */
mockNuxtImport('useSupabaseRealtime', () => () => {})

/**
 * The analysis as `analysisByIdWithDetailsQuery` serves it, reduced to what
 * the panel reads. Analysis 7 recorded the revision it ran; analysis 8 was
 * started before #48 and recorded nothing, which is the one case where the
 * row's pinned revision has to stand in.
 */
function analysisRow(id: number) {
  return {
    id,
    name: `analysis ${id}`,
    state: 'ok',
    // What the analysis was started with, as `useGalaxyDecodeParameters`
    // reads it: keyed by step id, then by parameter name. This is where the
    // panel's parameter *values* come from — the tool definition supplies
    // only their labels and widgets, which is why a tool it cannot read
    // costs the labels and not the values.
    parameters: { 2: { 'quality_cutoff': '10', 'advanced|mode': 'fast' } },
    datamap: {},
    invocation: {},
    workflow_id: 1,
    // Analysis 9 names a revision nothing is registered for, so its
    // description 404s — the only way to drive the failure path here.
    workflow_revision: id === 7 ? RAN_REVISION : (id === 9 ? 404 : null),
    workflows: { id: 1, name: 'A workflow', galaxy_id: GALAXY_WORKFLOW_ID, revision: PINNED_REVISION, name_key: 'aWorkflow', version_key: '1.0' },
    histories: { id: 1, state: 'ok', galaxy_id: 'galaxy-history-1' },
    jobs: [{ id: 1, step_id: 2, tool_id: TOOL.id, state: 'ok', stdout: '', stderr: '', analysis_id: id }],
    analysis_outputs: [],
  }
}

mockNuxtImport('analysisByIdWithDetailsQuery', () => ({ id }: { id: number }) => ({
  key: SUPABASE_ANALYSES_QUERY_KEYS.byIdWithDetails(id),
  query: async () => analysisRow(id),
}))
mockNuxtImport('analysisInputsViewByIdQuery', () => ({ analysisId }: { analysisId: number }) => ({
  key: ['test', 'analysis-inputs', analysisId],
  query: async () => [],
}))
mockNuxtImport('analysisOutputsViewByIdQuery', () => ({ analysisId }: { analysisId: number }) => ({
  key: ['test', 'analysis-outputs', analysisId],
  query: async () => [],
}))

/**
 * The one call the panel makes for the revision and the tools it pins (#87).
 * `registerEndpoint` matches a path literally, so there is one registration
 * per revision this suite expects to be asked for, and asking for any other
 * — or for the unpinned read the panel used to make — reaches nothing.
 */
function registerDescription(revision: number) {
  registerEndpoint(
    `/api/galaxy/workflows/${GALAXY_WORKFLOW_ID}/revisions/${revision}/description`,
    () => {
      describedRevisions.push(revision)
      const unusable = new Set(unavailableTools.map(tool => `${tool.toolId}@${tool.toolVersion}`))
      const key = `${TOOL.id}@${TOOL.version}`
      return {
        steps: {
          2: {
            id: 2,
            type: 'tool',
            label: null,
            uuid: 'step-uuid-2',
            annotation: null,
            tool_id: TOOL.id,
            tool_version: TOOL.version,
            tool_inputs: { quality_cutoff: '10' },
            input_connections: {},
            outputs: [],
          },
        },
        inputs: {},
        tools: unusable.has(key)
          ? {}
          : {
              [key]: {
                model_class: 'Tool',
                id: TOOL.id,
                name: 'seqtk_seq',
                version: TOOL.version,
                description: 'Convert FASTQ to FASTA',
                inputs: [{
                  model_class: 'IntegerToolParameter',
                  type: 'integer',
                  name: 'quality_cutoff',
                  label: 'Quality cutoff',
                  argument: null,
                  help: '',
                  refresh_on_change: false,
                  optional: false,
                  hidden: false,
                  is_dynamic: false,
                  min: 1,
                  max: 100,
                  value: '10',
                  area: false,
                }],
                outputs: [],
              } as unknown as GalaxyTool,
            },
        unavailable: unavailableTools,
      }
    },
  )
}

registerDescription(RAN_REVISION)
registerDescription(PINNED_REVISION)

/** Each case opens its own analysis so none meets another's cache entry. */
async function mountPanel(analysisId: number) {
  return mountSuspended({
    components: { UApp, AnalysisHistoryPanel },
    template: `<UApp><AnalysisHistoryPanel :analysis-id="${analysisId}" /></UApp>`,
  })
}

/**
 * The Colada cache the mounted app shares, reached from inside a component
 * because the store needs the app's pinia and a test body is outside it.
 * The description is cached with no expiry on purpose, so one test's answer
 * would otherwise be served to every test after it; the entries are removed
 * rather than invalidated, which a `staleTime` of forever would ignore.
 */
let queryCache: ReturnType<typeof useQueryCache> | undefined

async function forgetCachedAnswers() {
  if (!queryCache) {
    await mountSuspended(defineComponent({
      setup() {
        queryCache = useQueryCache()
        return () => h('div')
      },
    }))
  }
  for (const entry of queryCache!.getEntries()) {
    queryCache!.remove(entry)
  }
}

beforeEach(async () => {
  describedRevisions = []
  unavailableTools = []
  await forgetCachedAnswers()
})

// #48 pinned what an analysis runs to the workflow row's `revision` and
// recorded the revision on the analysis; the panel went on describing the
// analysis with whatever revision Galaxy had latest, so a save in Galaxy's
// editor could relabel a job's tool or its step under an analysis that never
// ran it (#68).
describe('the workflow the analysis history panel describes', () => {
  it('is the revision the analysis ran, not the latest one Galaxy holds', async () => {
    await mountPanel(7)

    await vi.waitFor(() => {
      expect(describedRevisions).toEqual([RAN_REVISION])
    })
  })

  // An analysis started before #48 recorded no revision: it ran whatever was
  // latest at the time, which nothing here can recover, and the revision its
  // workflow row is pinned to is the closest description this server holds.
  it('falls back to the revision the workflow row is pinned to when the analysis recorded none', async () => {
    await mountPanel(8)

    await vi.waitFor(() => {
      expect(describedRevisions).toEqual([PINNED_REVISION])
    })
  })
})

/**
 * #89. The graph is drawn from the revision the analysis ran, beside the jobs
 * rather than instead of them. Asserted here because a component nothing
 * mounts is a component nobody sees, and the graph's own suite proves only
 * that it draws when it is handed steps.
 */
describe('the graph beside the jobs', () => {
  it('draws the revision the analysis ran', async () => {
    const panel = await mountPanel(7)

    await vi.waitFor(() => {
      expect(panel.find('[data-testid="workflow-graph-view"]').exists()).toBe(true)
      // The one step the described revision declares, as a node.
      expect(panel.find('[data-testid="workflow-node-2"]').exists()).toBe(true)
    })
  })

  it('is left out when the revision could not be described, rather than drawn empty', async () => {
    // A failed description leaves `steps` empty, and an empty canvas reads as
    // a workflow of no steps. The alert beside it is what says otherwise.
    const panel = await mountPanel(9)

    await vi.waitFor(() => {
      expect(panel.find('[data-testid="workflow-description-error"]').exists()).toBe(true)
    })
    expect(panel.find('[data-testid="workflow-graph-view"]').exists()).toBe(false)
  })
})

/**
 * #87. Only the tool names and parameter labels on this page come from
 * Galaxy. The inputs, the jobs and their states, stdout, stderr and the
 * outputs all come from this server's own database, and a reader who opened
 * an analysis should not lose them because a proxy was briefly unwell.
 */
describe('the panel when Galaxy could not describe the workflow at all', () => {
  it('still shows the analysis, with the failure beside it rather than instead of it', async () => {
    // The revision nothing is registered for, so the description 404s.
    const panel = await mountPanel(9)

    await vi.waitFor(() => {
      expect(panel.find('[data-testid="workflow-description-error"]').exists(), 'the failure is reported').toBe(true)
    })
    expect(panel.text(), 'the inputs section survives').toContain('Inputs')
    expect(panel.text(), 'the jobs section survives').toContain('Jobs')
    expect(panel.text(), 'the outputs section survives').toContain('Outputs')
  })
})

/**
 * #87, #96. This panel has no submit and the jobs it describes have already
 * run, so nothing here is ever blocked. What it owes the reader is that a
 * tool it could not read is visibly that, rather than a step that renders
 * nothing and looks like a tool with no parameters.
 */
describe('a step whose tool the panel could not read', () => {
  /**
   * Open an accordion trigger whose label contains `label`, and answer with
   * the panel it controls. Reka unmounts a collapsed panel rather than
   * hiding it, so the job has to be opened before its Parameters trigger
   * exists at all.
   */
  async function open(panel: Awaited<ReturnType<typeof mountPanel>>, label: string) {
    const trigger = await vi.waitFor(() => {
      const found = panel.findAll('button').find(candidate => candidate.text().includes(label))
      expect(found, `"${label}" is on the page`).toBeDefined()
      return found!
    })
    await trigger.trigger('click')
    const panelId = trigger.attributes('aria-controls')
    return vi.waitFor(() => {
      const element = panel.element.querySelector(`[id="${panelId}"]`)
      expect(element, `"${label}" opened its panel`).not.toBeNull()
      return element!
    })
  }

  /**
   * Open the job, then its Parameters section, and answer with what that
   * renders.
   *
   * `jobLabel` is what the job's own header reads: the tool's name and
   * version when the definition arrived, and the panel's long-standing
   * "no tool name - no tool version" when it did not. That fallback is not
   * this ticket's to change — it predates the one composable and is what
   * a failed tool fetch produced before it too — but it is why the header
   * cannot be looked up by the tool's name in both cases.
   */
  async function parametersPanel(panel: Awaited<ReturnType<typeof mountPanel>>, jobLabel: string) {
    await open(panel, jobLabel)
    return open(panel, 'Parameters')
  }

  it('shows what was sent by its raw parameter names, saying why there are no labels', async () => {
    unavailableTools = [{ toolId: TOOL.id, toolVersion: TOOL.version, reason: 'unreachable' }]
    const panel = await mountPanel(7)

    const body = await parametersPanel(panel, 'no tool name')

    await vi.waitFor(() => {
      expect(body.textContent).toContain('could not be read from Galaxy')
      expect(body.textContent, 'the raw parameter name stands in for the label').toContain('quality_cutoff')
      // A conditional decodes to a nested object, which Vue interpolates as
      // `[object Object]` unless it is stringified.
      expect(body.textContent, 'a nested value is readable').toContain('{"mode":"fast"}')
    })
  })

  it('shows the label when the tool did arrive', async () => {
    const panel = await mountPanel(7)

    const body = await parametersPanel(panel, 'seqtk_seq')

    await vi.waitFor(() => {
      expect(body.textContent).toContain('Quality cutoff')
    })
    expect(body.textContent).not.toContain('could not be read from Galaxy')
  })
})
