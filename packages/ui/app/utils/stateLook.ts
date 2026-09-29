/**
 * How a run state is drawn, wherever it is drawn (#90).
 *
 * One shape shared by the step states the canvas draws (`stepStateLook`) and
 * by every state Galaxy reports (`galaxyStateLook`), because a state means the same thing
 * in the jobs list as on the node beside it, and a reader who learns a
 * colour on one should not have to learn it again on the other.
 *
 * The **word** is not optional and is never Galaxy's identifier. It is what
 * the element is labelled with, so the state is legible to a reader who
 * cannot tell the colours apart and to one hovering the icon — and so that
 * `setting_metadata` never reaches a screen verbatim.
 */

import type { BadgeProps } from '@nuxt/ui'

export interface StateLook {
  /** What a reader is told the state is, in the glossary's words. */
  readonly word: string
  readonly icon: string
  readonly color: NonNullable<BadgeProps['color']>
}

/**
 * A look's colour as a CSS value, for the places a class cannot serve — an
 * inline `color` or a border, where the name is only known at runtime.
 *
 * Nuxt UI's **semantic** variable, not a fixed shade. Each semantic colour
 * resolves to shade 500 in light mode and 400 in dark, so `var(--ui-error)`
 * is what `text-error` would have given; pinning `--ui-color-error-500`
 * instead lost the dark-mode shade, which is the one that has to lighten
 * against a dark background.
 *
 * `neutral` is the exception, because Nuxt UI generates no `--ui-neutral`:
 * `--ui-text-muted` is the alias that carries the same 500/400 flip over the
 * neutral palette.
 *
 * Derived from the same `color` the badges use rather than written out
 * again, so one state cannot end up two colours on one screen.
 */
export function uiColorVar(color: NonNullable<BadgeProps['color']>): string {
  return color === 'neutral' ? 'var(--ui-text-muted)' : `var(--ui-${color})`
}
