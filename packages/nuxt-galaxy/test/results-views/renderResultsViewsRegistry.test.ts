import { describe, expect, it } from 'vitest'
import { renderResultsViewsRegistry, renderResultsViewsTypes } from '../../src/results-views/template'

describe('renderResultsViewsRegistry', () => {
  it('writes one entry per view with its rung and a dynamic import of its file', () => {
    const code = renderResultsViewsRegistry([
      { rung: 'exact', name: 'satelliteFinder', version: '0.11', file: '/app/app/workflows/satelliteFinder/0.11/results.vue' },
    ])

    expect(code).toContain('export const resultsViews = [')
    expect(code).toContain('rung: "exact"')
    expect(code).toContain('name: "satelliteFinder"')
    expect(code).toContain('version: "0.11"')
    expect(code).toContain('import("/app/app/workflows/satelliteFinder/0.11/results.vue")')
    expect(code).toContain('defineAsyncComponent(')
  })

  it('writes a name-level entry with its name and no version, and an app-wide entry with neither', () => {
    const code = renderResultsViewsRegistry([
      { rung: 'name-level', name: 'satelliteFinder', file: '/app/app/workflows/satelliteFinder/results.vue' },
      { rung: 'app-wide', file: '/app/app/workflows/results.vue' },
    ])

    expect(code).toContain('rung: "name-level"')
    expect(code).toContain('name: "satelliteFinder"')
    expect(code).not.toContain('version:')
    expect(code).toContain('rung: "app-wide"')
    expect(code).toContain('import("/app/app/workflows/satelliteFinder/results.vue")')
    expect(code).toContain('import("/app/app/workflows/results.vue")')
  })

  it('keeps the keys verbatim, quoting whatever the directory names contain', () => {
    const code = renderResultsViewsRegistry([
      { rung: 'exact', name: 'Defense-Finder', version: '2.0.0+galaxy1', file: '/l/app/workflows/Defense-Finder/2.0.0+galaxy1/results.vue' },
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
  it('declares the registry module the page imports, with one entry type per rung', () => {
    const types = renderResultsViewsTypes()

    expect(types).toContain(`declare module '#build/nuxt-galaxy/results-views.mjs'`)
    expect(types).toContain('resultsViews')
    expect(types).toContain(`rung: 'exact'`)
    expect(types).toContain(`rung: 'name-level'`)
    expect(types).toContain(`rung: 'app-wide'`)
  })
})
