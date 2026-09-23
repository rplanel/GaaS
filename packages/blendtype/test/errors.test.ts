import { describe, expect, it } from 'vitest'
import { formatErrorMessage } from '../src/errors'

/**
 * What ofetch rejects with when Galaxy refuses a request: its own `message`
 * is the status line, and Galaxy's sentence sits in the parsed body under
 * `data.err_msg` (a `MessageException` body is `{ err_msg, err_code }`).
 */
function galaxyRefusal(errMsg: unknown) {
  return Object.assign(
    new Error('[POST] "api/workflows/wf-1/invocations": 400 Bad Request'),
    { statusCode: 400, data: { err_msg: errMsg, err_code: 400008 } },
  )
}

describe('formatErrorMessage', () => {
  // #48. Pinning an invocation to the activated revision makes Galaxy's
  // missing-tools refusal reachable, and the tool names are the whole answer.
  it('carries what Galaxy said over the status line ofetch wrote', () => {
    const message = formatErrorMessage(
      'workflow',
      'wf-1',
      'Error invoking',
      galaxyRefusal('Workflow was not invoked; the following required tools are not installed: fastp (version 0.23.4)'),
    )

    expect(message).toBe(
      'Error invoking workflow wf-1: Workflow was not invoked; the following required tools are not installed: fastp (version 0.23.4)',
    )
    expect(message).not.toContain('400 Bad Request')
  })

  it('falls back to the status line when Galaxy said nothing usable', () => {
    expect(formatErrorMessage('workflow', 'wf-1', 'Error invoking', galaxyRefusal('   ')))
      .toBe('Error invoking workflow wf-1: [POST] "api/workflows/wf-1/invocations": 400 Bad Request')
    expect(formatErrorMessage('workflow', 'wf-1', 'Error invoking', galaxyRefusal(42)))
      .toBe('Error invoking workflow wf-1: [POST] "api/workflows/wf-1/invocations": 400 Bad Request')
  })

  it('reads a plain error and a non-error as before', () => {
    expect(formatErrorMessage('workflow', 'wf-1', 'Error getting', new Error('connection refused')))
      .toBe('Error getting workflow wf-1: connection refused')
    expect(formatErrorMessage('workflow', undefined, 'Error listing', 'boom'))
      .toBe('Error listing workflow: boom')
  })
})
