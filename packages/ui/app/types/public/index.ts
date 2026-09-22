/**
 * The public types of `@gaas/ui`, reached through the `#gaas/ui` alias the
 * layer declares in its `nuxt.config.ts`.
 *
 * They are imported explicitly rather than auto-imported on purpose: Vue
 * resolves a `defineProps<T>()` type only through an import in the file, and
 * Nuxt does not hand its auto-import declarations to Vue as global type files
 * (ADR 0003). A results view therefore writes
 * `import type { ResultsViewProps } from '#gaas/ui'`.
 */
import type { ResultsViewAnalysis } from 'nuxt-galaxy'

export type { AnalysisInputWithDatasetAndTags, AnalysisOutputWithDatasetAndTags, ResultsViewAnalysis } from 'nuxt-galaxy'

/**
 * What a results view receives (ADR 0003): the analysis it is opened on, with
 * its workflow, its inputs and its outputs, each carrying its dataset and its
 * tags. The view never has to query the analysis before rendering.
 */
export interface ResultsViewProps {
  /** The analysis the view is opened on, as the route names it. */
  analysisId: number
  /** The analysis row with its workflow, inputs and outputs. */
  analysis: ResultsViewAnalysis
}
