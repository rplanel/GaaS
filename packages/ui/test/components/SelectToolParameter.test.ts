/**
 * That a select offers the options its tool declares and names the saved one
 * by its label (#166).
 *
 * Written before #166 moved the rule to `nuxt-galaxy`, against the component
 * as it was, so that the move is shown to change nothing a reader sees.
 *
 * Driven from `ccqtl_find_peaks`'s `level`, whose labels differ from their
 * values (`95%` against `95`), so a test can tell which of the two it is
 * reading. The form's menu lists the values and the read-only variant shows
 * the label: that is what the widget did when this was written, and pinning
 * it is the point.
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
 * What the menu lists once the reader opens it. It renders in a portal on
 * `document.body`, reached through the trigger's `aria-controls`.
 */
async function offered(wrapper: Awaited<ReturnType<typeof mountWith>>): Promise<string[]> {
  const trigger = wrapper.get('button[aria-haspopup="listbox"]')
  await trigger.trigger('click')
  return vi.waitFor(() => {
    const menu = document.getElementById(trigger.attributes('aria-controls') ?? '')
    expect(menu, 'the select opened its menu').not.toBeNull()
    const options = Array.from(menu!.querySelectorAll('[role="option"]'))
      .map(option => option.textContent?.trim() ?? '')
    expect(options, 'the menu lists options').not.toEqual([])
    return options
  })
}

describe('the recording this is about', () => {
  it('saves 95, which the tool labels 95%', () => {
    expect(savedValue(ccqtl, '5', 'level')).toBe('95')
    expect(level.options).toContainEqual(['95%', '95', true])
  })
})

describe('what a select offers', () => {
  it('lists every option the tool declares, by its value', async () => {
    const wrapper = await mountWith(savedValue(ccqtl, '5', 'level'), 'form')
    expect(await offered(wrapper)).toEqual(['80', '90', '95', '99'])
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
})
