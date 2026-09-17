import { log } from 'evlog/client'
import { describe, expect, it } from 'vitest'
import { useDatasetTags } from '../../../../src/runtime/app/composables/galaxy/useDatasetTags'

describe('useDatasetTags', () => {
  it('logs a warning when tags cannot be stringified', () => {
    const datasetName = 'unknown-result-file'
    const dataset = {
      tags: [{ label: 'unexpected-tag' }],
      datasets: { dataset_name: datasetName },
    }

    useDatasetTags({
      dataset,
      tagTypes: ['expected-tag'],
    })

    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('cannot handle'),
        datasetName,
      }),
    )
  })
})
