import { describe, expect, it } from 'vitest'
import { findResultsView } from '../../app/utils/resultsViews'

/** A registry as the module generates it, with a stand-in for the component. */
const registry = [
  { name: 'satelliteFinder', version: '0.11', component: 'satellite-0.11' },
  { name: 'satelliteFinder', version: '0.10+galaxy2', component: 'satellite-0.10' },
  { name: 'defenseFinder', version: '2.0.0+galaxy1', component: 'defense' },
]

describe('findResultsView', () => {
  it('returns the entry whose name and version equal the workflow tags', () => {
    const view = findResultsView(registry, { name: 'satelliteFinder', version: '0.11' })

    expect(view?.component).toBe('satellite-0.11')
  })

  it('matches case exactly on the name', () => {
    expect(findResultsView(registry, { name: 'satellitefinder', version: '0.11' })).toBeUndefined()
    expect(findResultsView(registry, { name: 'SatelliteFinder', version: '0.11' })).toBeUndefined()
  })

  it('matches the version character for character, dots included', () => {
    expect(findResultsView(registry, { name: 'satelliteFinder', version: '0.1.1' })).toBeUndefined()
    expect(findResultsView(registry, { name: 'satelliteFinder', version: '011' })).toBeUndefined()
    expect(findResultsView(registry, { name: 'satelliteFinder', version: '0.10' })).toBeUndefined()
  })

  it('finds nothing in an empty registry', () => {
    expect(findResultsView([], { name: 'satelliteFinder', version: '0.11' })).toBeUndefined()
  })
})
