import type { ComputedRef, MaybeRef } from '#imports'
import { computed, toValue } from '#imports'

/**
 * A composable function to create a hint string for Galaxy workflows.
 * It combines a help message and an argument into a single string.
 *
 * @param {MaybeRef<string | null>} help - A reference to the help message.
 * @param {MaybeRef<string | null>} argument - A reference to the argument.
 * @returns {{ hint: ComputedRef<string> }} An object containing the computed hint string.
 */
export function useGalaxyHint(help: MaybeRef<string | null> = null, argument: MaybeRef<string | null> = null): { hint: ComputedRef<string> } {
  const sanitizedHint = computed(() => {
    return [toValue(argument), toValue(help)].filter(h => h !== null && h !== undefined && h !== '').join(': ')
  })

  return { hint: sanitizedHint }
}
