import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { withFixtureNuxt } from './loadFixture'

/** A layer with an exact and a name-level view of `satelliteFinder`, and no app-wide one. */
const layerDir = join(__dirname, '../fixtures/results-views-layer')
const layerWorkflows = join(layerDir, 'app/workflows')

/**
 * What an app extending that layer is built with: the registry the results
 * page imports, rendered as the build writes it, and the alias results views
 * import their props type from (ADR 0003, amended for ADR 0009). The fixture
 * lists `nuxt-galaxy` and nothing else, so whatever is there, it put there.
 */
async function loadResultsViews() {
  return withFixtureNuxt(async (options) => {
    const registry = options.build.templates.find(template => template.filename === 'gaas/results-views.mjs')
    return {
      registry: await registry?.getContents?.({} as Parameters<NonNullable<typeof registry.getContents>>[0]),
      typesRegistered: options.build.templates.some(template => template.filename === 'gaas/results-views.d.ts'),
      alias: options.alias['#nuxt-galaxy'],
    }
  }, { layers: [layerDir] })
}

describe('the results views nuxt-galaxy finds', () => {
  let built: Awaited<ReturnType<typeof loadResultsViews>>

  beforeAll(async () => {
    built = await loadResultsViews()
  })

  it('registers the exact view a layer the app extends defines, keyed by its directories verbatim', () => {
    expect(built.registry).toContain('rung: "exact"')
    expect(built.registry).toContain('version: "0.11"')
    expect(built.registry).toContain(`import(${JSON.stringify(join(layerWorkflows, 'satelliteFinder/0.11/results.vue'))})`)
  })

  it('registers that layer\'s name-level view, and no app-wide view since none exists', () => {
    expect(built.registry).toContain('rung: "name-level"')
    expect(built.registry).toContain(`import(${JSON.stringify(join(layerWorkflows, 'satelliteFinder/results.vue'))})`)
    expect(built.registry).not.toContain('rung: "app-wide"')
  })

  it('declares the registry\'s types for the page that imports it', () => {
    expect(built.typesRegistered).toBe(true)
  })

  it('points #nuxt-galaxy at the module\'s own types, where ResultsViewProps is', () => {
    expect(built.alias).toMatch(/\/runtime\/types\/nuxt-galaxy$/)
  })
})
