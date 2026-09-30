import type { WorkflowError } from 'blendtype'
import { Data } from 'effect'

/**
 * A 4xx from Galaxy on a read is Galaxy saying "no such thing": 404 for an
 * id it does not know, 400 for one it cannot decode or a revision index past
 * the end of the history ("Version does not exist" is a `MessageException`,
 * which Galaxy answers 400). Anything else it fails with (a 503, a network
 * error, a 500) says nothing about the thing asked for and is not read as its
 * absence.
 */
export function galaxyHasNoSuchThing(error: WorkflowError): boolean {
  return error.statusCode === 400 || error.statusCode === 404
}

/**
 * What a Galaxy proxy fails with when `galaxyHasNoSuchThing` holds, so the
 * handler answers 404 with a sentence rather than logging a fault (#125).
 * The message is the sentence: it names what Galaxy does not hold, a revision
 * by the editor's number.
 */
export class GalaxyHasNoSuchThing extends Data.TaggedError('GalaxyHasNoSuchThing')<{
  readonly message: string
}> {}
