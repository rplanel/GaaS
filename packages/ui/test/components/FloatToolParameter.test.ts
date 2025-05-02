import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import FloatToolParameter from '../../app/components/galaxy/FloatToolParameter.vue'

describe('floatToolParameter', () => {
  it('check props', async () => {
    const floatValue = '0.553'
    const min = 0
    const max = 1
    const component = await mountSuspended(FloatToolParameter, {

      props: {
        min,
        max,
        value: floatValue,
        area: false,
        variant: 'form',
        name: 'my-float-name-form',
        argument: '--test',
        hidden: false,
        refresh_on_change: false,
        optional: false,
        is_dynamic: false,
        modelValue: floatValue,
        label: 'input label',
        type: 'float',
        model_class: 'FloatToolParameter',
        help: 'help text',

      },
    })

    expect(component.vm.step).toBe(0.001)
    expect(component.html()).toContain(`min="${min}"`)
    expect(component.html()).toContain(`max="${max}"`)
    expect(component.html()).toContain(`value="${floatValue}"`)
    expect(component.text()).toContain('input label')
    expect(component.text()).toContain('--test')
    expect(component.text()).toContain('help text')
    expect(component.html()).toContain('type="number"')
    expect(component.html()).toContain('name="my-float-name-form"')
  })
})
