/**
 * How every state Galaxy reports is drawn (#90).
 *
 * The suite exists because twelve of them were drawn as nothing at all:
 * `GalaxyStatus` mapped `skipped`, `stopped`, `waiting`, `deleted`,
 * `deleting`, `stop`, `resubmitted`, `upload`, `empty`, `deferred`,
 * `discarded` and `ready` to `{ icon: '', color: '' }`, which renders an
 * empty `<UIcon name="">` — so a skipped job and a job with no state looked
 * identical, and AC4 was invisible everywhere except on the canvas.
 *
 * Driven off `blendtype`'s own lists rather than a written-down copy of
 * them: the claim is about *every* state Galaxy can report, and a list
 * written here would stop being that the day one is added.
 */

import type { GalaxyState, InvocationState } from 'blendtype'
import { GalaxyStates, InvocationStates, JobStates } from 'blendtype'
import { describe, expect, it } from 'vitest'
import { galaxyStateLook } from '../../app/utils/galaxyStateLook'
import { jobStateLook } from '../../app/utils/stepStateLook'

const EVERY_STATE = [...new Set<GalaxyState | InvocationState>([...GalaxyStates, ...InvocationStates])]

describe('galaxyStateLook', () => {
  it.each(EVERY_STATE)('draws %s as something a reader can see', (state) => {
    const look = galaxyStateLook(state)

    expect(look.icon).not.toBe('')
    expect(look.color).not.toBe('')
    expect(look.word).not.toBe('')
  })

  it.each(EVERY_STATE)('names %s in words rather than in Galaxy\'s identifier', (state) => {
    // `CONTEXT.md` names putting an API value in front of a reader among the
    // things not to do, and `setting_metadata` was reaching the screen
    // verbatim through the fallback branch.
    const { word } = galaxyStateLook(state)

    expect(word).not.toBe(state)
    expect(word).not.toContain('_')
  })

  it.each(JobStates)('draws the job state %s exactly as the canvas draws it', (state) => {
    // A colour has to mean the same thing in the jobs list and on the node
    // beside it, so the two read one map rather than two that agree today.
    expect(galaxyStateLook(state)).toEqual(jobStateLook(state))
  })

  it('tells a reader something rather than nothing about a state it does not know', () => {
    // The unions are `blendtype`'s reading of Galaxy, not Galaxy itself: a
    // state added upstream arrives here as a string in none of them, and a
    // blank is the one thing that must not be drawn.
    const look = galaxyStateLook('a_state_galaxy_grew_later' as GalaxyState)

    expect(look.icon).not.toBe('')
    expect(look.word).not.toContain('_')
  })
})
