/**
 * That a select offers the options its tool declares and names the saved one
 * by its label (#166).
 *
 * Written before #166 moved the rule to `nuxt-galaxy`, against the component
 * as it was, so that the move is shown to change nothing a reader sees.
 *
 * Driven from `ccqtl_find_peaks`'s `level`, whose labels differ from their
 * values (`95%` against `95`), so a test can tell which of the two it is
 * reading. When this was written the form's menu listed the values and only
 * the read-only variant showed the label. Since #183 the menu, its trigger
 * and the read-only variant all show labels, as Galaxy does, and what is
 * stored is still the value.
 */

import type { GalaxySingleSelectToolParameter, WorkflowParameterValue } from 'blendtype'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { declaredParameter, FIXTURES, loadFixture, savedValue } from '../../../nuxt-galaxy/test/characterisation/fixtures'
import SelectToolParameter from '../../app/components/galaxy/SelectToolParameter.vue'

const ccqtl = loadFixture(FIXTURES.ccqtlToday)

const level = declaredParameter(ccqtl, '5', 'level', 'select') as GalaxySingleSelectToolParameter

/** The mount to tear down after each test: its menu is portalled outside it. */
let mounted: { unmount: () => void } | undefined

async function mountWith(modelValue: WorkflowParameterValue, variant: 'form' | 'display') {
  const wrapper = await mountSuspended(SelectToolParameter, {
    props: { ...level, modelValue: modelValue as string, variant },
    attachTo: document.body,
  })
  mounted = wrapper
  return wrapper
}

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * The options of the menu, once the reader opens it. It renders in a portal
 * on `document.body`, reached through the trigger's `aria-controls`.
 */
async function openOptions(wrapper: Awaited<ReturnType<typeof mountWith>>): Promise<HTMLElement[]> {
  const trigger = wrapper.get('button[aria-haspopup="listbox"]')
  await trigger.trigger('click')
  return vi.waitFor(() => {
    const menu = document.getElementById(trigger.attributes('aria-controls') ?? '')
    expect(menu, 'the select opened its menu').not.toBeNull()
    const options = Array.from(menu!.querySelectorAll<HTMLElement>('[role="option"]'))
    expect(options, 'the menu lists options').not.toEqual([])
    return options
  })
}

/** What the menu lists once the reader opens it. */
async function offered(wrapper: Awaited<ReturnType<typeof mountWith>>): Promise<string[]> {
  return (await openOptions(wrapper)).map(option => option.textContent?.trim() ?? '')
}

describe('the recording this is about', () => {
  it('saves 95, which the tool labels 95%', () => {
    expect(savedValue(ccqtl, '5', 'level')).toBe('95')
    expect(level.options).toContainEqual(['95%', '95', true])
  })
})

describe('what a select offers', () => {
  it('lists every option the tool declares, by its label', async () => {
    const wrapper = await mountWith(savedValue(ccqtl, '5', 'level'), 'form')
    expect(await offered(wrapper)).toEqual(['80%', '90%', '95%', '99%'])
  })

  it('stores the value of the option the reader chooses, not its label', async () => {
    const wrapper = await mountWith(savedValue(ccqtl, '5', 'level'), 'form')
    const chosen = (await openOptions(wrapper)).find(option => option.textContent?.trim() === '99%')
    expect(chosen, 'the menu offers 99%').toBeDefined()
    chosen!.click()
    await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')).toEqual([['99']]))
  })

  it('names the saved value by its label while the menu is closed', async () => {
    const wrapper = await mountWith(savedValue(ccqtl, '5', 'level'), 'form')
    expect(wrapper.get('button[aria-haspopup="listbox"]').text()).toBe('95%')
  })
})

describe('what the read-only variant shows', () => {
  it('names the saved value by its option\'s label', async () => {
    const wrapper = await mountWith(savedValue(ccqtl, '5', 'level'), 'display')
    expect(wrapper.text()).toContain('95%')
  })

  it('names nothing for a saved value no option holds', async () => {
    // Hand-written: no recording saves a value its tool does not offer.
    const wrapper = await mountWith('42', 'display')
    expect(wrapper.text()).not.toMatch(/\d+%/)
  })

  it('names each value a multiple select saved by its option\'s label', async () => {
    // Hand-written: no recording has a multiple select, so this is `level`
    // declared multiple.
    const wrapper = await mountSuspended(SelectToolParameter, {
      props: { ...level, multiple: true, value: null, modelValue: ['80', '99'], variant: 'display' },
      attachTo: document.body,
    })
    mounted = wrapper
    expect(wrapper.text()).toContain('80%')
    expect(wrapper.text()).toContain('99%')
    expect(wrapper.text()).not.toContain('95%')
  })
})
