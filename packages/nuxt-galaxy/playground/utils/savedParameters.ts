import type { WorkflowParameterValue } from 'blendtype'

/** A parameter the tool declares, with the value saved for it. */
export interface SavedParameter<P> {
  parameter: P
  value: WorkflowParameterValue
}

/**
 * The parameters a bag holds a value for, each with that value, in the order
 * the tool declares them: a step's saved parameters, a section's or a
 * conditional's bag, or one instance of a repeat.
 *
 * The second UI offers a widget for nothing else. A parameter the revision
 * saved nothing for has nothing to edit, and Galaxy uses the tool's own
 * default for a parameter left out (`CONTEXT.md`, *Absent value*), so a
 * widget for it would send a value nobody chose. `@gaas/ui`'s form draws the
 * same line at every level.
 */
export function savedParameters<P extends { name: string }>(
  declared: readonly P[],
  bag: { readonly [name: string]: WorkflowParameterValue },
): SavedParameter<P>[] {
  return declared.flatMap((parameter) => {
    const value = bag[parameter.name]
    return value === undefined ? [] : [{ parameter, value }]
  })
}
