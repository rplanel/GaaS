import { describe, expect, it } from 'vitest'
import { renderResultsViewsRegistry, renderResultsViewsTypes } from '../../modules/results-views/template'

describe('renderResultsViewsRegistry', () => {
  it('writes one entry per view with a dynamic import of its file', () => {
    const code = renderResultsViewsRegistry([
      { name: 'satelliteFinder', version: '0.11', file: '/app/app/workflows/satelliteFinder/0.11/results.vue' },
    ])

    expect(code).toContain('export const resultsViews = [')
    expect(code).toContain('name: "satelliteFinder"')
    expect(code).toContain('version: "0.11"')
    expect(code).toContain('import("/app/app/workflows/satelliteFinder/0.11/results.vue")')
    expect(code).toContain('defineAsyncComponent(')
  })

  it('keeps the keys verbatim, quoting whatever the directory names contain', () => {
    const code = renderResultsViewsRegistry([
      { name: 'Defense-Finder', version: '2.0.0+galaxy1', file: '/l/app/workflows/Defense-Finder/2.0.0+galaxy1/results.vue' },
    ])

    expect(code).toContain('name: "Defense-Finder"')
    expect(code).toContain('version: "2.0.0+galaxy1"')
  })

  it('renders an empty registry when no view exists', () => {
    const code = renderResultsViewsRegistry([])

    expect(code).toContain('export const resultsViews = [')
    expect(code).not.toContain('import(')
  })
})

describe('renderResultsViewsTypes', () => {
  it('declares the registry module the page imports', () => {
    const types = renderResultsViewsTypes()

    expect(types).toContain(`declare module '#build/gaas/results-views.mjs'`)
    expect(types).toContain('resultsViews')
  })
})
