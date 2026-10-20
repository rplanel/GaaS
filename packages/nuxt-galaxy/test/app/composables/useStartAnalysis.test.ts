import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStartAnalysis } from '../../../src/runtime/app/composables/useStartAnalysis'

/**
 * #163. Starting an analysis, faked only where the app meets the server: the
 * endpoint below stands in for `POST /api/db/analyses`, and what is asserted
 * is what it was sent and what the caller is told.
 */

/** What the endpoint answers next: the created analysis, a refusal, or a 200 with no body. */
let answer: { created: { id: number } } | { refusal: { statusCode: number, statusMessage?: string } } | 'empty'
let lastBody: unknown
/** Called as the request arrives, to read what the caller holds while it is in flight. */
let whileSent: (() => void) | undefined

registerEndpoint('/api/db/analyses', {
  method: 'POST',
  handler: async (event) => {
    lastBody = await readBody(event)
    whileSent?.()
    if (answer === 'empty')
      return null
    if ('refusal' in answer)
      throw createError(answer.refusal)
    return answer.created
  },
})

beforeEach(() => {
  answer = { created: { id: 7 } }
  lastBody = undefined
  whileSent = undefined
})

const reads = { storage_object_id: 'object-1', dataset_name: 'reads.fasta' }

describe('useStartAnalysis', () => {
  // The model is what a form edits, nested as Galaxy's groups are; what is
  // sent is the flat dict Galaxy reads, named `group|child`.
  it('sends the name, the datamap, the workflow and the parameters encoded, and resolves with the analysis', async () => {
    const { start } = useStartAnalysis()

    const created = await start({
      name: 'Integrons',
      datamap: { 0: reads },
      parameters: { 3: { mode: 'fast', advanced: { min_length: 0 } } },
      workflowId: 12,
    })

    expect(lastBody).toEqual({
      name: 'Integrons',
      datamap: { 0: reads },
      parameters: { 3: { 'mode': 'fast', 'advanced|min_length': 0 } },
      workflowId: 12,
    })
    expect(created).toEqual({ id: 7 })
  })

  // A 400 names the input the datamap left out, in a sentence written for
  // the reader (#43), so it is what the reader is shown.
  it('describes a refused start in the server\'s words, and resolves with nothing', async () => {
    answer = { refusal: { statusCode: 400, statusMessage: 'No dataset was chosen for "Reference genome"' } }
    const { start, failure } = useStartAnalysis()

    const created = await start({ name: 'Integrons', datamap: {}, parameters: {}, workflowId: 12 })

    expect(created).toBeNull()
    expect(failure.value).toEqual({
      title: 'The analysis could not be started as submitted',
      description: 'No dataset was chosen for "Reference genome"',
      signIn: false,
    })
  })

  // ADR 0002 and #25 took the empty body out of the server. If it comes
  // back, the reader is told, not left with nothing to navigate to.
  it('describes a 200 that carries no analysis, and resolves with nothing', async () => {
    answer = 'empty'
    const { start, failure } = useStartAnalysis()

    const created = await start({ name: 'Integrons', datamap: { 0: reads }, parameters: {}, workflowId: 12 })

    expect(created).toBeNull()
    expect(failure.value).toEqual({
      title: 'Could not start the analysis',
      description: 'Something went wrong on our side. Please try again.',
      signIn: false,
    })
  })

  it('is starting while the request is in flight, and only then', async () => {
    const { start, starting } = useStartAnalysis()
    let startingWhileSent: boolean | undefined
    whileSent = () => {
      startingWhileSent = starting.value
    }

    expect(starting.value).toBe(false)
    await start({ name: 'Integrons', datamap: { 0: reads }, parameters: {}, workflowId: 12 })

    expect(startingWhileSent).toBe(true)
    expect(starting.value).toBe(false)
  })

  // Cleared as the next start is sent, so a refusal still on screen from an
  // earlier attempt is never read as this one's answer.
  it('clears an earlier refusal before the next start is sent', async () => {
    const { start, failure } = useStartAnalysis()
    answer = { refusal: { statusCode: 503 } }
    await start({ name: 'Integrons', datamap: { 0: reads }, parameters: {}, workflowId: 12 })
    expect(failure.value?.title).toBe('Galaxy is unavailable right now')

    answer = { created: { id: 8 } }
    let failureWhileSent: unknown = 'not sent'
    whileSent = () => {
      failureWhileSent = failure.value
    }
    await start({ name: 'Integrons', datamap: { 0: reads }, parameters: {}, workflowId: 12 })

    expect(failureWhileSent).toBeNull()
    expect(failure.value).toBeNull()
  })
})
