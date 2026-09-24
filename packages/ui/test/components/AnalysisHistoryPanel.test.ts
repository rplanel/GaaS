import type { GalaxyWorkflow } from 'blendtype'
import { UApp } from '#components'
import { SUPABASE_ANALYSES_QUERY_KEYS } from '#imports'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AnalysisHistoryPanel from '../../app/components/analysis/AnalysisHistoryPanel.vue'

/** The Galaxy identifier of the stored workflow every analysis here ran. */
const GALAXY_WORKFLOW_ID = 'galaxy-wf-1'
/** The Galaxy revision the workflow row is pinned to, its `revision` column. */
const PINNED_REVISION = 5
/** The revision analysis 7 was started against and recorded (#48), a later save having moved the row on since. */
const RAN_REVISION = 3

/** The `version` the panel asked Galaxy for on its last workflow fetch, `null` when it asked for none. */
let requestedRevision: string | null = null
/** How many times the panel asked Galaxy to describe the workflow: `null` above means nothing until this is not 0. */
let workflowFetches = 0

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
    parameters: {},
    datamap: {},
    invocation: {},
    workflow_id: 1,
    workflow_revision: id === 7 ? RAN_REVISION : null,
    workflows: { id: 1, name: 'A workflow', galaxy_id: GALAXY_WORKFLOW_ID, revision: PINNED_REVISION, name_key: 'aWorkflow', version_key: '1.0' },
    histories: { id: 1, state: 'ok', galaxy_id: 'galaxy-history-1' },
    jobs: [],
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
 * The Galaxy proxy, recording which revision it was asked for. The query
 * string is read off the raw request rather than with `getQuery`, since `h3`
 * is not a dependency of this package (see `InvokeForm.test.ts`). A workflow
 * with no steps keeps `useGalaxyTool` from fetching anything.
 */
registerEndpoint(`/api/galaxy/workflows/${GALAXY_WORKFLOW_ID}`, (event) => {
  workflowFetches += 1
  requestedRevision = new URL(event.node.req.url ?? '/', 'http://test').searchParams.get('version')
  return {
    data: { inputs: {}, steps: {} } as unknown as GalaxyWorkflow,
  }
})

/** Each case opens its own analysis so none meets another's cache entry. */
async function mountPanel(analysisId: number) {
  return mountSuspended({
    components: { UApp, AnalysisHistoryPanel },
    template: `<UApp><AnalysisHistoryPanel :analysis-id="${analysisId}" /></UApp>`,
  })
}

beforeEach(() => {
  requestedRevision = null
  workflowFetches = 0
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
      expect(workflowFetches).toBeGreaterThan(0)
      expect(requestedRevision).toBe(String(RAN_REVISION))
    })
  })

  // An analysis started before #48 recorded no revision: it ran whatever was
  // latest at the time, which nothing here can recover, and the revision its
  // workflow row is pinned to is the closest description this server holds.
  it('falls back to the revision the workflow row is pinned to when the analysis recorded none', async () => {
    await mountPanel(8)

    await vi.waitFor(() => {
      expect(workflowFetches).toBeGreaterThan(0)
      expect(requestedRevision).toBe(String(PINNED_REVISION))
    })
  })
})
