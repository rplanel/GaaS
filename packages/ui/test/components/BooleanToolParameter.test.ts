/**
 * That a boolean switch shows the value the workflow saved, on a state
 * written by either release (#111).
 *
 * The widget used to compare the saved value against the tool's `truevalue`
 * and `falsevalue`, which are **strings** and are not the state spelling at
 * all: Galaxy writes them only through `to_param_dict_string`, on the way to
 * a command line (`tools/parameters/basic.py:660`, 26.1). What the state
 * really holds is `to_json(to_python(value))` — `'true'`/`'false'` at 22.05,
 * a real `true`/`false` at 26.1 — so the comparison matched only the tools
 * that happen to declare `truevalue="true"`, and matched nothing at all once
 * 26.1 started sending a boolean.
 *
 * Driven from recorded payloads rather than hand-written values, because a
 * hand-written `true` is exactly what the prop's old `string` declaration
 * would have refused while the real payload sailed past it: `Step.vue`
 * renders each widget through `<component :is>`, whose props Vue does not
 * typecheck.
 */

import type { GalaxyBooleanToolParameter, GalaxyTool, WorkflowParameterValue } from 'blendtype'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import BooleanToolParameter from '../../app/components/galaxy/BooleanToolParameter.vue'
import { FIXTURES, loadFixture } from '../characterisation/fixtures'

const nested = loadFixture(FIXTURES.conditionalRepeatRuntime)
const ccqtl = loadFixture(FIXTURES.ccqtlToday)

const INTEGRON_FINDER = 'toolshed.g2.bx.psu.edu/repos/iuc/integron_finder/integron_finder/2.0.5+galaxy1@2.0.5+galaxy1'
const CCQTL_FIND_PEAKS = 'toolshed.g2.bx.psu.edu/repos/rplanel/ccqtl_find_peaks/ccqtl_find_peaks/0.0.1_beta.2+galaxy0@0.0.1_beta.2+galaxy0'

/** The recorded declaration of one boolean parameter, by name, top level only. */
function booleanParameter(tool: GalaxyTool, name: string): GalaxyBooleanToolParameter {
  const found = tool.inputs.find(input => input.name === name)
  if (!found || found.type !== 'boolean') {
    throw new TypeError(`${name} is not a boolean parameter of ${tool.id}`)
  }
  return found
}

/** What the revision saved for one top-level parameter of one step. */
function savedValue(fixture: { live: { steps: Record<string, { tool_inputs?: Record<string, WorkflowParameterValue> | null }> } }, step: string, name: string): WorkflowParameterValue {
  const inputs = fixture.live.steps[step]?.tool_inputs
  if (!inputs || !(name in inputs)) {
    throw new TypeError(`step ${step} saved no ${name}`)
  }
  return inputs[name]!
}

async function mountWith(parameter: GalaxyBooleanToolParameter, modelValue: WorkflowParameterValue, variant: 'form' | 'display' = 'form') {
  return mountSuspended(BooleanToolParameter, {
    props: { ...parameter, modelValue, variant },
  })
}

/** Whether the rendered switch reads as on, as Reka UI spells it. */
function isOn(html: string): boolean {
  const checked = html.match(/aria-checked="(true|false)"/)
  if (!checked) {
    throw new TypeError(`no switch in the rendered output: ${html}`)
  }
  return checked[1] === 'true'
}

describe('booleanToolParameter — the value the workflow saved', () => {
  describe('26.1, where the saved value is a real boolean', () => {
    const gbk = booleanParameter(nested.tools[INTEGRON_FINDER]!, 'gbk')

    it('is the case the recording holds: a real boolean beside a non-boolean truevalue', () => {
      // The two halves of the defect, pinned so that a re-recording that
      // loses either one fails here rather than making the tests below
      // vacuous.
      expect(savedValue(nested, '1', 'gbk')).toBe(true)
      expect(gbk.truevalue).toBe('--gbk')
      expect(gbk.falsevalue).toBe('')
    })

    it('shows on for a saved true', async () => {
      const component = await mountWith(gbk, savedValue(nested, '1', 'gbk'))
      expect(isOn(component.html())).toBe(true)
    })

    it('shows off for a saved false', async () => {
      const keepPalindromes = booleanParameter(nested.tools[INTEGRON_FINDER]!, 'pdf')
      expect(savedValue(nested, '1', 'pdf')).toBe(true)
      const component = await mountWith(keepPalindromes, false)
      expect(isOn(component.html())).toBe(false)
    })

    it('shows the same value on the disabled display switch', async () => {
      const component = await mountWith(gbk, savedValue(nested, '1', 'gbk'), 'display')
      expect(component.html()).toContain('disabled')
      expect(isOn(component.html())).toBe(true)
    })
  })

  describe('a value the switch has no position for', () => {
    const gbk = booleanParameter(nested.tools[INTEGRON_FINDER]!, 'gbk')

    it('reads a runtime marker as off rather than as a truthy object', async () => {
      // Galaxy short-circuits a runtime marker before `to_python` ever sees
      // it (`basic.py:230` at 22.05, `:295` at 26.1), so the reader is not
      // asked and the switch shows off — the position it showed before this
      // change too. The marker is the one the recording carries on step 1;
      // pairing it with a boolean is what is hand-written, because no
      // recorded workflow sets a boolean at runtime.
      const marker = savedValue(nested, '1', 'topology_file')
      expect(marker).toEqual({ __class__: 'RuntimeValue' })
      const component = await mountWith(gbk, marker)
      expect(isOn(component.html())).toBe(false)
    })
  })

  describe('what the form submits, which this change leaves alone', () => {
    const gbk = booleanParameter(nested.tools[INTEGRON_FINDER]!, 'gbk')

    it('emits the state spelling and never truevalue', async () => {
      // `from_json` is `to_python` is `string_as_bool` (`basic.py:567` at
      // 22.05, `:662` at 26.1), so `'true'` is read as true on both
      // releases while `'--gbk'` would be read as false. Asserted against
      // the recorded declaration precisely because its `truevalue` is the
      // one that would be wrong.
      const component = await mountWith(gbk, false)
      await component.find('button[role="switch"]').trigger('click')
      expect(component.emitted('update:modelValue')).toEqual([['true']])

      const on = await mountWith(gbk, savedValue(nested, '1', 'gbk'))
      await on.find('button[role="switch"]').trigger('click')
      expect(on.emitted('update:modelValue')).toEqual([['false']])
    })
  })

  describe('22.05, where the saved value is a string', () => {
    const adjust = booleanParameter(ccqtl.tools[CCQTL_FIND_PEAKS]!, 'adjust')

    it('shows off for a saved "false"', async () => {
      expect(savedValue(ccqtl, '5', 'adjust')).toBe('false')
      const component = await mountWith(adjust, savedValue(ccqtl, '5', 'adjust'))
      expect(isOn(component.html())).toBe(false)
    })

    it('shows on for a saved "true"', async () => {
      // The recording holds only the `false` side of this parameter, so the
      // value here is the 22.05 spelling of the other one rather than a
      // second recording. The declaration is still the recorded one.
      const component = await mountWith(adjust, 'true')
      expect(isOn(component.html())).toBe(true)
    })
  })
})
