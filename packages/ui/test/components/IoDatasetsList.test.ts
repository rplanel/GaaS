import type { AnalysisOutputWithStoragePathRow } from 'nuxt-galaxy'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import IoDatasetsList from '../../app/components/galaxy/analysis/IoDatasetsList.vue'

// The list only reaches for the client when a download is clicked.
mockNuxtImport('useSupabaseClient', () => () => ({} as never))

/** An output row as the storage-path view returns it, named so it can be traced in the DOM. */
function output(id: number, datasetName: string): AnalysisOutputWithStoragePathRow {
  return {
    analysis_id: 7,
    annotation: null,
    created_at: '2026-09-01T00:00:00Z',
    dataset_id: id,
    dataset_name: datasetName,
    galaxy_id: `galaxy-${id}`,
    galaxy_metadata: null,
    history_id: 1,
    id,
    job_id: 1,
    metadata: { size: 2048 },
    name: datasetName,
    owner_id: 'owner-1',
    state: 'ok',
    storage_object_id: null,
    storage_path: `analyses/7/${datasetName}`,
    uuid: null,
  }
}

describe('ioDatasetsList', () => {
  it('shows every dataset it is given', async () => {
    const wrapper = await mountSuspended(IoDatasetsList, {
      props: { items: [output(1, 'genes.tsv'), output(2, 'systems.tsv')] },
    })

    expect(wrapper.text()).toContain('2 datasets')
    expect(wrapper.text()).toContain('genes.tsv')
    expect(wrapper.text()).toContain('systems.tsv')
  })

  it('links no dataset to a per-output result page', async () => {
    const wrapper = await mountSuspended(IoDatasetsList, {
      props: { items: [output(1, 'genes.tsv'), output(2, 'systems.tsv')] },
    })

    expect(wrapper.find('a[href*="/results/"]').exists()).toBe(false)
  })

  it('says when there is nothing to show', async () => {
    const wrapper = await mountSuspended(IoDatasetsList, { props: { items: [] } })

    expect(wrapper.text()).toContain('No datasets available.')
  })
})
