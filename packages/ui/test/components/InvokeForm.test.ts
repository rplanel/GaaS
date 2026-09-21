import { UApp } from '#components'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import InvokeForm from '../../app/components/galaxy/workflow/InvokeForm.vue'

/** The status the analyses endpoint refuses the next submission with. */
let refuseWith: number | null = null
/** Whether it answers 200 with nothing in the body, as it did before #25. */
let serveEmptyBody = false

/**
 * The real endpoint's refusals, as `toHttpError` sends them: a status and
 * nothing the reader is expected to read. The status is set on the Node
 * response rather than through `createError` so this test does not reach for
 * `h3`, which is not a declared dependency of this package.
 */
registerEndpoint('/api/db/analyses', {
  method: 'POST',
  handler: (event) => {
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
})

describe('invokeForm component', () => {
  it('can mount component', async () => {
    const component = await mountForm()
    expect(component.text()).toContain('Select workflow parameters')
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
