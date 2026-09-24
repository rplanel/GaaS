/**
 * What a version's name and label have to look like to be published.
 *
 * A results view is found by a directory named after the two values verbatim
 * (ADR 0003), so each one has to be a legal directory name on Linux and macOS,
 * a URL segment and a component prop at once. Both are typed by the
 * administrator in the publish dialog, pre-filled from Galaxy tags when there
 * are any, and Galaxy itself only strips whitespace from a tag and caps it at
 * 255 characters, which lets through a path separator, a `+` and a leading
 * dot, none of which can name a directory that the results view scanner would
 * then find. A value that matches is stored exactly as typed, case included.
 *
 * The same rule as ADR 0003's `^[A-Za-z0-9][A-Za-z0-9._-]*$`, spelled the way
 * the lint rules ask: `\w` is ASCII-only without the `u` flag, so a letter
 * outside ASCII is still refused.
 */
export const RESULTS_VIEW_DIRECTORY_NAME_PATTERN = /^[a-z0-9][\w.-]*$/i

/** Whether a name or a label can name the directory holding a results view. */
export function canNameResultsViewDirectory(value: string): boolean {
  return RESULTS_VIEW_DIRECTORY_NAME_PATTERN.test(value)
}
