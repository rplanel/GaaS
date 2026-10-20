import type { StartAnalysisFailure } from '../utils/startAnalysisFailure'
import type { WorkflowParametersModel } from './galaxy/types'
import { ref, toValue } from '#imports'
import { log } from 'evlog/client'
import { describeStartAnalysisFailure, unexplainedStartAnalysisFailure } from '../utils/startAnalysisFailure'
import { useGalaxyEncodeParameters } from './galaxy/useGalaxyEncodeParameters'
import { useErrorStatus } from './useErrorStatus'

/** What starting an analysis takes: what the reader chose, before it is encoded. */
export interface StartAnalysisRequest<Dataset = unknown> {
  /** Already validated: `startAnalysisSchema` outputs it trimmed. */
  readonly name: string
  /** One dataset per input, keyed by the input's step index. */
  readonly datamap: Readonly<Record<string, Dataset>>
  /** The parameter model a form edits, encoded here into what Galaxy reads. */
  readonly parameters: WorkflowParametersModel
  readonly workflowId: number
}

/**
 * Starting an analysis (#163), as the invoke form did it before #163 moved it
 * here, so that any UI sends what `@gaas/ui` sends and tells the reader what
 * it tells them.
 */
export function useStartAnalysis() {
  /** Whether a start has been sent and not answered yet. */
  const starting = ref(false)
  /** Why the last start was refused, or `null` if none was. */
  const failure = ref<StartAnalysisFailure | null>(null)

  async function start<Dataset>(request: StartAnalysisRequest<Dataset>): Promise<{ id: number } | null> {
    // Cleared first, so a refusal still on screen from an earlier attempt is
    // never read as this one's answer.
    failure.value = null
    const { encodedParameters } = useGalaxyEncodeParameters(request.parameters)
    starting.value = true
    // Only the request is guarded, so a failed request is the only thing
    // this can claim.
    const created = await $fetch<{ id: number } | null>('/api/db/analyses', {
      method: 'POST',
      body: {
        name: request.name,
        datamap: request.datamap,
        parameters: toValue(encodedParameters),
        workflowId: request.workflowId,
      },
    }).catch((error: unknown) => {
      // Described rather than thrown: every status this endpoint refuses
      // with is one the reader may be able to act on, and a fatal page would
      // cost them the form they just filled in. The rejection itself is
      // handed over, not just its status: a 400 carries the server's own
      // words for which input was left out (#43, #46), and the status alone
      // cannot say. The cause is still only ever worth a log.
      const { errorStatus } = useErrorStatus(error)
      log.error({
        action: 'analysis:start_failed',
        tag: 'startAnalysis',
        status: toValue(errorStatus),
        error: String(error),
      })
      failure.value = describeStartAnalysisFailure(error)
      return null
    })
    starting.value = false
    if (!created) {
      // Either the request was refused above and is already described, or
      // it answered 200 with no analysis to navigate to, which arrives as
      // `undefined`. ADR 0002 and #25 took that empty body out of the
      // server; if it returns, the reader is told rather than left with a
      // stopped spinner and nothing else.
      if (failure.value === null) {
        log.error({ action: 'analysis:start_returned_no_analysis', tag: 'startAnalysis' })
        failure.value = unexplainedStartAnalysisFailure
      }
      return null
    }
    return created
  }

  return { start, starting, failure }
}
