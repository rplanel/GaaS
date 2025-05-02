import { mountSuspended } from '@nuxt/test-utils/runtime'

import { describe, expect, it } from 'vitest'
import InvokeForm from '../../app/components/galaxy/workflow/InvokeForm.vue'

describe('invokeForm component', () => {
  it('can mount component', async () => {
    const component = await mountSuspended(InvokeForm, {
      props: {
        workflowId: 1,
      },
    })
    expect(component.text()).toContain('Select workflow parameters')
  })
})
