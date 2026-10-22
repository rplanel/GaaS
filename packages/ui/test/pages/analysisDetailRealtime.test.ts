import type { VueWrapper } from '@vue/test-utils'
import { UApp } from '#components'
import { SUPABASE_ANALYSES_INPUTS_VIEW_QUERY_KEYS, SUPABASE_ANALYSES_OUTPUTS_VIEW_QUERY_KEYS, SUPABASE_ANALYSES_QUERY_KEYS } from '#imports'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AnalysisDetailPage from '../../app/pages/analyses/[analysisId].vue'

/** The analysis the page is opened on; each test picks its own id so none meets another's cache entry. */
const analysisIdParam = ref('7')

mockNuxtImport('useRoute', () => () => ({ params: { analysisId: analysisIdParam.value } }))

/** A table listener a channel registered, and whether the channel has been removed since. */
interface TableListener {
  channelName: string
  table: string
  onChange: () => void
  removed: boolean
}

/** The name of every channel opened on the client, once per `channel(...)` call. */
const openedChannels: string[] = []
/** Every table listener registered on any channel, removed ones included. */
const tableListeners: TableListener[] = []

/**
 * The Supabase client, reduced to its realtime half: it records each channel
 * opened and the table each listens to, and removing a channel silences its
 * listeners. The page and its panel hand it to queries that are faked below,
 * so nothing else of the client is reached.
 */
const fakeSupabase = {
  channel(channelName: string) {
    openedChannels.push(channelName)
    const listeners: TableListener[] = []
    const channel = {
      listeners,
      on(_event: 'postgres_changes', filter: { table: string }, onChange: () => void) {
        const listener = { channelName, table: filter.table, onChange, removed: false }
        listeners.push(listener)
        tableListeners.push(listener)
        return channel
      },
      subscribe() {
        return channel
      },
    }
    return channel
  },
  removeChannel(channel: { listeners: TableListener[] }) {
    for (const listener of channel.listeners)
      listener.removed = true
  },
}

mockNuxtImport('useSupabaseClient', () => () => fakeSupabase as never)

/**
 * What Supabase does with a row change: every channel still listening to the
 * table hears it. The listener takes the whole table, so a channel's name
 * plays no part in which changes reach it.
 */
function changeRowIn(table: string) {
  for (const listener of tableListeners) {
    if (listener.table === table && !listener.removed)
      listener.onChange()
  }
}

/** How many times the page's own analysis query ran: its realtime handler invalidates it. */
let pageQueryRuns = 0

mockNuxtImport('analysisByIdWithOutputsAndWorkflowsQuery', () => ({ id }: { id: number }) => ({
  key: SUPABASE_ANALYSES_QUERY_KEYS.byIdWithOutputsAndWorkflows(id, true, true),
  query: async () => {
    pageQueryRuns++
    return {
      id,
      name: 'run',
      created_at: '2026-10-22T10:00:00Z',
      workflows: { id: 1, name: 'Satellite Finder', name_key: 'satelliteFinder', version_key: '0.11' },
      analysis_outputs: [],
    }
  },
}))

mockNuxtImport('analysisByIdWithDetailsQuery', () => ({ id }: { id: number }) => ({
  key: SUPABASE_ANALYSES_QUERY_KEYS.byIdWithDetails(id),
  query: async () => ({
    id,
    name: 'run',
    state: 'running',
    parameters: {},
    workflow_revision: 3,
    workflows: { id: 1, galaxy_id: 'galaxy-wf-1', revision: 3 },
    jobs: [],
    analysis_outputs: [],
  }),
}))

/** How many times the history panel's inputs query ran: only the panel's realtime handler refreshes it. */
let panelInputsQueryRuns = 0

/**
 * The panel's inputs, under their real key, which sits outside the analysis's
 * own: the page's handler never reaches it, so a run after a change can only
 * be the panel's handler. The panel refreshes rather than refetches, and a
 * refresh reads a fresh entry from the cache, so the entry is never fresh
 * here; otherwise a change in the first five seconds would show nothing.
 */
mockNuxtImport('analysisInputsViewByIdQuery', () => ({ analysisId }: { analysisId: number }) => ({
  key: SUPABASE_ANALYSES_INPUTS_VIEW_QUERY_KEYS.byAnalysisId(analysisId),
  staleTime: 0,
  query: async () => {
    panelInputsQueryRuns++
    return []
  },
}))

/** The panel's outputs, under their real key, which neither handler reaches today; nothing here counts them. */
mockNuxtImport('analysisOutputsViewByIdQuery', () => ({ analysisId }: { analysisId: number }) => ({
  key: SUPABASE_ANALYSES_OUTPUTS_VIEW_QUERY_KEYS.byAnalysisId(analysisId),
  query: async () => [],
}))

/** The revision's description plays no part here: a workflow of no steps, never asked of Galaxy. */
mockNuxtImport('useGalaxyWorkflowDescription', () => () => ({
  workflowSteps: ref({}),
  isLoading: ref(false),
  retry: () => {},
  error: ref(undefined),
}) as never)

let wrapper: VueWrapper | undefined

/**
 * The page with its real history panel, which listen to the same three
 * tables. The panel's lists and the child route stay out: they open no channel.
 */
async function mountPageWithPanel(analysisId: string) {
  analysisIdParam.value = analysisId
  const panelInputsQueryRunsBefore = panelInputsQueryRuns
  wrapper = await mountSuspended({
    components: { UApp, AnalysisDetailPage },
    template: '<UApp><AnalysisDetailPage /></UApp>',
  }, {
    global: {
      stubs: { NuxtPage: true, GalaxyAnalysisIoDatasetsList: true, GalaxyAnalysisJobs: true },
    },
  })
  // The panel is mounted once it has asked for its inputs; until then only
  // the page's channels could have been opened.
  await vi.waitFor(() => expect(panelInputsQueryRuns).toBeGreaterThan(panelInputsQueryRunsBefore))
}

afterEach(() => {
  // The composable keeps its channels in module state, so a mount left
  // behind would hand the next test channels it never opened.
  wrapper?.unmount()
  wrapper = undefined
  openedChannels.length = 0
  tableListeners.length = 0
})

describe('analysis page realtime channels', () => {
  // The page and the history panel it mounts listen to the same three
  // tables. Under one name per table they share a channel; under two sets of
  // names the page held six (#170).
  it('opens one channel per table for the page and its history panel together', async () => {
    await mountPageWithPanel('7')

    expect([...openedChannels].sort()).toEqual([
      'galaxy:analysis_outputs:7',
      'galaxy:histories:7',
      'galaxy:jobs:7',
    ])

    wrapper!.unmount()
    wrapper = undefined
    expect(tableListeners.every(listener => listener.removed)).toBe(true)
  })

  it.each([
    ['histories', '8'],
    ['jobs', '9'],
    ['analysis_outputs', '10'],
  ])('hands a change to %s to both the page and its history panel', async (table, analysisId) => {
    await mountPageWithPanel(analysisId)
    const pageQueryRunsBefore = pageQueryRuns
    const panelInputsQueryRunsBefore = panelInputsQueryRuns

    changeRowIn(table)

    await vi.waitFor(() => {
      expect(pageQueryRuns).toBeGreaterThan(pageQueryRunsBefore)
      expect(panelInputsQueryRuns).toBeGreaterThan(panelInputsQueryRunsBefore)
    })
  })
})
