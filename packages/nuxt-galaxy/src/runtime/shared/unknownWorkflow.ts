/**
 * The token standing for the Unknown workflow bucket wherever a workflow is
 * named by its identifier. The bucket has no identifier of its own -- every
 * monitoring row carries a workflow id, and what makes one unknown is a
 * workflow name that was never recorded -- so it travels as a word instead.
 *
 * Both halves have to spell it identically: the usage endpoints parse it out
 * of a request and narrow the counts by it, and a UI writes it into the URL
 * and compares a selection against it. `@gaas/ui` once kept a copy of its own
 * (#169); it now reads this one through its auto-import, since a layer cannot
 * import `runtime/shared/` by path.
 */
export const UNKNOWN_WORKFLOW_SELECTION = 'unknown'
