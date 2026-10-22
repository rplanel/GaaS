import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanResultsViews } from '../../src/results-views/scan'

/**
 * Two layers as Nuxt hands them to a module: the application first, then the
 * layer it extends. Both define a view at every rung (`satelliteFinder/0.11`,
 * `satelliteFinder`, and the app-wide one), so the fixture also settles who wins.
 */
const fixtures = join(__dirname, '../fixtures/results-views')
const appDir = join(fixtures, 'app/')
const layerDir = join(fixtures, 'layer/')
const emptyDir = join(fixtures, 'empty/')

describe('scanResultsViews', () => {
  it('finds every app/workflows/<name>/<version>/results.vue across the layers as an exact view', async () => {
    const { views } = await scanResultsViews([appDir, layerDir])

    const exact = views.filter(view => view.rung === 'exact')
    expect(exact.map(view => `${view.name}/${view.version}`)).toEqual([
      'satelliteFinder/0.10+galaxy2',
      'satelliteFinder/0.11',
      'defenseFinder/2.0.0+galaxy1',
    ])
  })

  it('finds app/workflows/<name>/results.vue as a name-level view', async () => {
    const { views } = await scanResultsViews([appDir, layerDir])

    const nameLevel = views.filter(view => view.rung === 'name-level')
    expect(nameLevel.map(view => view.name)).toEqual(['nameOnly', 'satelliteFinder', 'defenseFinder'])
    expect(nameLevel.find(view => view.name === 'defenseFinder')?.file)
      .toBe(`${layerDir}workflows/defenseFinder/results.vue`)
  })

  it('finds app/workflows/results.vue as the app-wide view', async () => {
    const { views } = await scanResultsViews([appDir, layerDir])

    const appWide = views.filter(view => view.rung === 'app-wide')
    expect(appWide).toEqual([{ rung: 'app-wide', file: `${appDir}workflows/results.vue` }])
  })

  it('keeps the directory names verbatim as the keys', async () => {
    const { views } = await scanResultsViews([appDir, layerDir])

    const defenseFinder = views.find(view => view.rung === 'exact' && view.name === 'defenseFinder')
    expect(defenseFinder).toMatchObject({ rung: 'exact', name: 'defenseFinder', version: '2.0.0+galaxy1' })
    expect(defenseFinder?.file).toBe(`${layerDir}workflows/defenseFinder/2.0.0+galaxy1/results.vue`)
  })

  it('lets the first layer given win when two layers define the same view, at every rung', async () => {
    const { views } = await scanResultsViews([appDir, layerDir])

    const exact = views.filter(view => view.rung === 'exact' && view.name === 'satelliteFinder' && view.version === '0.11')
    expect(exact).toHaveLength(1)
    expect(exact[0]?.file).toBe(`${appDir}workflows/satelliteFinder/0.11/results.vue`)

    const nameLevel = views.filter(view => view.rung === 'name-level' && view.name === 'satelliteFinder')
    expect(nameLevel).toHaveLength(1)
    expect(nameLevel[0]?.file).toBe(`${appDir}workflows/satelliteFinder/results.vue`)

    const appWide = views.filter(view => view.rung === 'app-wide')
    expect(appWide).toHaveLength(1)
    expect(appWide[0]?.file).toBe(`${appDir}workflows/results.vue`)
  })

  it('reports each file a layer defines that the application hides, and what hides it', async () => {
    const { shadowed } = await scanResultsViews([appDir, layerDir])

    expect(shadowed).toEqual([
      { file: `${layerDir}workflows/results.vue`, shadowedBy: `${appDir}workflows/results.vue` },
      { file: `${layerDir}workflows/satelliteFinder/results.vue`, shadowedBy: `${appDir}workflows/satelliteFinder/results.vue` },
      { file: `${layerDir}workflows/satelliteFinder/0.11/results.vue`, shadowedBy: `${appDir}workflows/satelliteFinder/0.11/results.vue` },
    ])
  })

  it('reports nothing shadowed when only one layer is scanned', async () => {
    const { shadowed } = await scanResultsViews([layerDir])

    expect(shadowed).toEqual([])
  })

  it('ignores files where a directory is expected and a component that is not results.vue', async () => {
    const { views } = await scanResultsViews([appDir])

    expect(views.some(view => view.rung !== 'app-wide' && view.name === 'README.md')).toBe(false)
    expect(views.some(view => view.file.endsWith('Helper.vue'))).toBe(false)
  })

  it('returns nothing for a layer without a workflows directory', async () => {
    await expect(scanResultsViews([emptyDir])).resolves.toEqual({ views: [], shadowed: [] })
  })
})
