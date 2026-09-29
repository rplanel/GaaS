/**
 * The colour a state is drawn in, as a CSS value (#90).
 *
 * Worth its own suite for one reason: the value has to **shift with the
 * colour mode**, and nothing that renders it can tell. `GalaxyStatus` used
 * `text-error` and `text-success` before #90, which resolve to Nuxt UI's
 * semantic variables — shade 500 in light, 400 in dark. Replacing them with
 * an inline `var(--ui-color-error-500)` looked identical in every test and
 * in light mode, and pinned the shade that has to lighten against a dark
 * background.
 */

import type { BadgeProps } from '@nuxt/ui'
import { describe, expect, it } from 'vitest'
import { uiColorVar } from '../../app/utils/stateLook'

/** The colours this application draws a state in. */
const COLORS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const satisfies readonly NonNullable<BadgeProps['color']>[]

describe('uiColorVar', () => {
  it.each(COLORS.filter(color => color !== 'neutral'))(
    'draws %s with Nuxt UI\'s semantic variable',
    (color) => {
      expect(uiColorVar(color)).toBe(`var(--ui-${color})`)
    },
  )

  it('falls back to the muted text alias for neutral', () => {
    // Nuxt UI generates `--ui-{color}` only for the six semantic colours, so
    // there is no `--ui-neutral` to read. `--ui-text-muted` is the alias
    // that carries the same 500/400 flip over the neutral palette.
    expect(uiColorVar('neutral')).toBe('var(--ui-text-muted)')
  })

  it.each(COLORS)('never pins a shade for %s, which would not follow dark mode', (color) => {
    // The whole point. A `-500` here renders the same in both modes, and
    // only a reader in dark mode ever sees that it is wrong.
    expect(uiColorVar(color)).not.toMatch(/-\d{2,3}\)/)
  })
})
