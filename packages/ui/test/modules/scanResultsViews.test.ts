import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanResultsViews } from '../../modules/results-views/scan'

/**
 * Two layers as Nuxt hands them to a module: the application first, then the
 * layer it extends. Both define `satelliteFinder/0.11`, so the fixture also
 * settles who wins.
 */
const fixtures = join(__dirname, '../fixtures/results-views')
const appDir = join(fixtures, 'app/')
const layerDir = join(fixtures, 'layer/')
const emptyDir = join(fixtures, 'empty/')

describe('scanResultsViews', () => {
  it('finds every app/workflows/<name>/<version>/results.vue across the layers', async () => {
    const views = await scanResultsViews([appDir, layerDir])

    expect(views.map(view => `${view.name}/${view.version}`)).toEqual([
      'satelliteFinder/0.10+galaxy2',
      'satelliteFinder/0.11',
      'defenseFinder/2.0.0+galaxy1',
    ])
  })

  it('keeps the directory names verbatim as the keys', async () => {
    const views = await scanResultsViews([appDir, layerDir])

    const defenseFinder = views.find(view => view.name === 'defenseFinder')
    expect(defenseFinder).toMatchObject({ name: 'defenseFinder', version: '2.0.0+galaxy1' })
    expect(defenseFinder?.file).toBe(`${layerDir}workflows/defenseFinder/2.0.0+galaxy1/results.vue`)
  })

  it('lets the first layer given win when two layers define the same view', async () => {
    const views = await scanResultsViews([appDir, layerDir])

    const exact = views.filter(view => view.name === 'satelliteFinder' && view.version === '0.11')
    expect(exact).toHaveLength(1)
    expect(exact[0]?.file).toBe(`${appDir}workflows/satelliteFinder/0.11/results.vue`)
  })

  it('ignores files where a directory is expected and a results.vue at the wrong depth', async () => {
    const views = await scanResultsViews([appDir])

    expect(views.some(view => view.name === 'README.md')).toBe(false)
    expect(views.some(view => view.name === 'nameOnly')).toBe(false)
    expect(views.some(view => view.file.endsWith('Helper.vue'))).toBe(false)
  })

  it('returns nothing for a layer without a workflows directory', async () => {
    await expect(scanResultsViews([emptyDir])).resolves.toEqual([])
  })
})
