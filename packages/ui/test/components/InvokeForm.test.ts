import type { IncomingMessage } from 'node:http'
import { UApp } from '#components'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import InvokeForm from '../../app/components/galaxy/workflow/InvokeForm.vue'

/** The status the analyses endpoint refuses the next submission with. */
let refuseWith: number | null = null
/** Whether it answers 200 with nothing in the body, as it did before #25. */
let serveEmptyBody = false

/** How many times the form actually asked the server to start an analysis. */
let requestsMade = 0
/** The body of the last submission that reached the endpoint. */
let lastBody: Record<string, unknown> | null = null

/**
 * The submitted JSON. `readBody` would mean importing `h3`, which is not a
 * declared dependency of this package — the same reason the refusals below
 * set the status on the response directly. The harness has already buffered
 * the body onto the request by the time the handler runs, which is the same
 * place `readBody` would reach for it last.
 */
function submittedBody(req: IncomingMessage): Record<string, unknown> {
  const { body } = req as IncomingMessage & { body?: string }
  if (body === undefined)
    throw new Error('the harness did not buffer the request body onto req.body')
  return JSON.parse(body)
}

/**
 * The real endpoint's refusals, as `toHttpError` sends them: a status and
 * nothing the reader is expected to read. The status is set on the Node
 * response rather than through `createError` so this test does not reach for
 * `h3`, which is not a declared dependency of this package.
 */
registerEndpoint('/api/db/analyses', {
  method: 'POST',
  handler: (event) => {
    requestsMade += 1
    lastBody = submittedBody(event.node.req)
    if (refuseWith !== null) {
      event.node.res.statusCode = refuseWith
      return { statusCode: refuseWith, statusMessage: 'Refused' }
    }
    if (serveEmptyBody) {
      return null
    }
    return { id: 7 }
  },
})

async function mountForm() {
  return mountSuspended({
    components: { UApp, InvokeForm },
    template: '<UApp><InvokeForm :workflow-id="1" /></UApp>',
  })
}

/** Name the analysis and ask for it, the way a reader does. */
async function submit(wrapper: Awaited<ReturnType<typeof mountForm>>) {
  await wrapper.find('input[name="name"]').setValue('My analysis')
  await wrapper.find('form').trigger('submit')
}

beforeEach(() => {
  refuseWith = null
  serveEmptyBody = false
  requestsMade = 0
  lastBody = null
})

describe('invokeForm component', () => {
  it('can mount component', async () => {
    const component = await mountForm()
    expect(component.text()).toContain('Select workflow parameters')
  })

  // #36: `z.string().max(256)` accepts `''`, so a name that was typed and then
  // cleared validated, `UForm` emitted submit, and `runAnalysis`' own falsy
  // guard dropped it without a word. Nothing reached the server and nothing
  // reached the reader.
  it('refuses a name the reader typed and then cleared', async () => {
    const form = await mountForm()

    await form.find('input[name="name"]').setValue('My analysis')
    await form.find('input[name="name"]').setValue('')
    await form.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(form.text()).toContain('Required')
    })
    expect(requestsMade).toBe(0)
  })

  // An untouched name is `undefined`, which plain `z.string()` already
  // rejected. Pinned so the `min(1)` above cannot be traded for it.
  it('refuses a name the reader never entered', async () => {
    const form = await mountForm()

    await form.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(form.text()).toContain('Required')
    })
    expect(requestsMade).toBe(0)
  })

  it('sends the name the reader entered', async () => {
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(requestsMade).toBe(1)
    })
    expect(lastBody).toMatchObject({ name: 'My analysis', workflowId: 1 })
  })

  it('tells the reader when Galaxy refuses the submission', async () => {
    refuseWith = 503
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(form.text()).toContain('Galaxy is unavailable right now')
    })
    // `UAlert` carries no role of its own, so without this the refusal is
    // silent to a reader using a screen reader
    expect(form.find('[role="alert"]').text()).toContain('Galaxy is unavailable right now')
  })

  it('offers a way back to the login page when the session has gone', async () => {
    refuseWith = 401
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(form.text()).toContain('Your session expired')
    })
    // the action has to go somewhere, or the 401 still silently does nothing
    const signIn = form.find('[data-testid="start-analysis-failure-sign-in"]')
    expect(signIn.exists()).toBe(true)
    expect(signIn.attributes('href')).toBe('/login')
  })

  it('does not offer the login page for a refusal the session cannot fix', async () => {
    refuseWith = 404
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(form.text()).toContain('That workflow is no longer available')
    })
    expect(form.find('[data-testid="start-analysis-failure-sign-in"]').exists()).toBe(false)
  })

  // #25 stopped the server answering 200 with an empty body. The reader is
  // told if it ever does again, rather than meeting the bare `TypeError` the
  // destructure used to throw into a catch that discarded it.
  it('tells the reader when the server answers with no analysis', async () => {
    serveEmptyBody = true
    const form = await mountForm()

    await submit(form)

    await vi.waitFor(() => {
      expect(form.text()).toContain('Could not start the analysis')
    })
  })

  // `login.vue` navigates to whatever this cookie holds and falls back to the
  // default page, so an unset cookie would strand the reader away from the
  // workflow they were starting.
  it('records where to return before sending the reader to sign in', async () => {
    refuseWith = 401
    const form = await mountForm()

    await submit(form)
    await vi.waitFor(() => {
      expect(form.text()).toContain('Your session expired')
    })
    await form.find('[data-testid="start-analysis-failure-sign-in"]').trigger('click')

    expect(document.cookie).toContain('redirect-path')
  })
})
