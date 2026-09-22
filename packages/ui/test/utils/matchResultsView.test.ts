import { describe, expect, it } from 'vitest'
import { matchResultsView } from '../../app/utils/resultsViews'

/** A registry as the module generates it, with a stand-in for each component. */
const exactOnly = [
  { rung: 'exact', name: 'satelliteFinder', version: '0.11', component: 'satellite-0.11' },
  { rung: 'exact', name: 'satelliteFinder', version: '0.10+galaxy2', component: 'satellite-0.10' },
  { rung: 'exact', name: 'defenseFinder', version: '2.0.0+galaxy1', component: 'defense' },
] as const

const nameLevel = { rung: 'name-level', name: 'satelliteFinder', component: 'satellite-any' } as const
const appWide = { rung: 'app-wide', component: 'any-workflow' } as const

const everyRung = [...exactOnly, nameLevel, appWide]

describe('matchResultsView', () => {
  it('applies the exact view whose name and version equal the workflow tags, before any fallback', () => {
    const match = matchResultsView(everyRung, { name: 'satelliteFinder', version: '0.11' })

    expect(match).toEqual({ rung: 'exact', view: exactOnly[0] })
  })

  it('applies the name-level view to every version of that name without an exact view', () => {
    expect(matchResultsView(everyRung, { name: 'satelliteFinder', version: '0.12' }))
      .toEqual({ rung: 'name-level', view: nameLevel })
    expect(matchResultsView(everyRung, { name: 'satelliteFinder', version: '1.0' }))
      .toEqual({ rung: 'name-level', view: nameLevel })
  })

  it('never applies a name-level view to another name', () => {
    const match = matchResultsView([...exactOnly, nameLevel], { name: 'defenseFinder', version: '3.0' })

    expect(match).toEqual({ rung: 'none', view: undefined })
  })

  it('applies the app-wide view to a workflow no exact or name-level view names', () => {
    const match = matchResultsView(everyRung, { name: 'padloc', version: '2.0' })

    expect(match).toEqual({ rung: 'app-wide', view: appWide })
  })

  it('says none when no rung applies', () => {
    expect(matchResultsView(exactOnly, { name: 'padloc', version: '2.0' })).toEqual({ rung: 'none', view: undefined })
    expect(matchResultsView([], { name: 'satelliteFinder', version: '0.11' })).toEqual({ rung: 'none', view: undefined })
  })

  it('matches case exactly on the name, at the exact and the name-level rung', () => {
    expect(matchResultsView(everyRung, { name: 'satellitefinder', version: '0.11' }).rung).toBe('app-wide')
    expect(matchResultsView(everyRung, { name: 'SatelliteFinder', version: '0.11' }).rung).toBe('app-wide')
  })

  it('matches the version character for character, dots included', () => {
    expect(matchResultsView(exactOnly, { name: 'satelliteFinder', version: '0.1.1' }).rung).toBe('none')
    expect(matchResultsView(exactOnly, { name: 'satelliteFinder', version: '011' }).rung).toBe('none')
    expect(matchResultsView(exactOnly, { name: 'satelliteFinder', version: '0.10' }).rung).toBe('none')
  })
})
