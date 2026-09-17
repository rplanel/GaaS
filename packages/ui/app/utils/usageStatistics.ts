/** Stands in for a success rate that has no value yet. */
export const NO_SUCCESS_RATE_LABEL = '—'

/**
 * The name of the single bucket collecting analyses whose workflow could not
 * be identified, because it was deleted before its name was recorded.
 */
export const UNKNOWN_WORKFLOW_LABEL = 'Unknown workflow'

/** Explains, on hover, why a success rate has no value yet. */
export const NO_COMPLETED_ANALYSES_EXPLANATION = 'No completed analyses yet'

export interface SuccessRateDisplay {
  /** False when no analysis has reached a definitive outcome. */
  hasValue: boolean
  /** Either a whole percentage, or a dash when there is no value. */
  label: string
  /** Set only when there is no value, to explain the dash. */
  tooltip: string | undefined
}

/**
 * Decides how a success rate reads.
 *
 * Only Succeeded and Failed count towards the rate, so until one of them has
 * occurred it has no value and is shown as a dash. Showing zero instead would
 * read as total failure to someone whose analyses are all still Pending.
 *
 * The rate itself is always the one the server computed; this never recomputes
 * it, so every surface shows the same number. Whether a rate exists at all is
 * decided here from the two terminal counts, because the endpoint's response
 * carries a plain number rather than a nullable one. Should that contract ever
 * gain a nullable rate, this condition should give way to it.
 */
export function formatSuccessRate(counts: {
  success: number
  error: number
  successRate: number
}): SuccessRateDisplay {
  if (counts.success + counts.error === 0) {
    return {
      hasValue: false,
      label: NO_SUCCESS_RATE_LABEL,
      tooltip: NO_COMPLETED_ANALYSES_EXPLANATION,
    }
  }

  return {
    hasValue: true,
    label: `${Math.round(counts.successRate * 100)}%`,
    tooltip: undefined,
  }
}

/**
 * How a row of per-workflow usage names its workflow.
 *
 * The server collapses every analysis whose workflow name never survived into
 * one bucket carrying a null id; it reaches the screen under the glossary's
 * name for it, never under the raw value the server uses.
 */
export function workflowUsageLabel(usage: {
  workflowId: number | null
  name: string | null
}): string {
  if (usage.workflowId === null || usage.name === null) {
    return UNKNOWN_WORKFLOW_LABEL
  }

  return usage.name
}
