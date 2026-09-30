/**
 * That a boolean switch shows the value the workflow saved, on a state
 * written by either release (#111).
 *
 * The widget used to compare the saved value against the tool's `truevalue`
 * and `falsevalue`, and those are not the state spelling at all: Galaxy
 * writes them only through `to_param_dict_string`, on the way to a command
 * line (`tools/parameters/basic.py:582` at 22.05, `:678` at 26.1). What the
 * state holds is `to_json` — `json.dumps(self.to_python(value, app))` at
 * 22.05 and `self.to_python(value, app)` at 26.1 — so the comparison matched
 * only the tools that happen to declare `truevalue="true"`, and matched
 * nothing at all once 26.1 started sending a real boolean.
 *
 * Driven from recorded payloads rather than hand-written values, because a
 * hand-written `true` is exactly what the prop's old `string` declaration
 * would have refused while the real payload sailed past it: `Step.vue`
 * renders each widget through `<component :is>`, whose props Vue does not
 * typecheck. Where a value here is hand-written it is because no recording
 * holds that case, and it says so.
 */

import type { GalaxyBooleanToolParameter, WorkflowParameterValue } from 'blendtype'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import BooleanToolParameter from '../../app/components/galaxy/BooleanToolParameter.vue'
import { declaredParameter, FIXTURES, loadFixture, savedValue } from '../characterisation/fixtures'

const nested = loadFixture(FIXTURES.conditionalRepeatRuntime)
const ccqtl = loadFixture(FIXTURES.ccqtlToday)

async function mountWith(parameter: GalaxyBooleanToolParameter, modelValue: WorkflowParameterValue, variant: 'form' | 'display' = 'form') {
  return mountSuspended(BooleanToolParameter, {
    props: { ...parameter, modelValue, variant },
  })
}

/** Whether the rendered switch reads as on, as Reka UI spells it. */
function isOn(html: string): boolean {
  const checked = html.match(/aria-checked="(true|false)"/)
  if (!checked) {
    throw new Error(`no switch in the rendered output: ${html}`)
  }
  return checked[1] === 'true'
}

/** `integron_finder`'s `--gbk` flag, the parameter #111 was found on. */
const gbk = declaredParameter(nested, '1', 'gbk', 'boolean')

describe('booleanToolParameter — the value the workflow saved', () => {
  describe('26.1, where the saved value is a real boolean', () => {
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
      // `no_logfile` rather than `gbk` because the recording saves it as a
      // real `false`, so both sides of 26.1 come off a payload. It is also
      // the one boolean of this tool whose `truevalue` *is* `"true"` — the
      // shape the old comparison got right by accident — so this is the
      // assertion that says the rewrite did not break the case that worked.
      const noLogfile = declaredParameter(nested, '1', 'no_logfile', 'boolean')
      expect(noLogfile.truevalue).toBe('true')
      expect(savedValue(nested, '1', 'no_logfile')).toBe(false)
      const component = await mountWith(noLogfile, savedValue(nested, '1', 'no_logfile'))
      expect(isOn(component.html())).toBe(false)
    })

    it('shows the same value on the disabled display switch', async () => {
      // The variant a reader cannot argue with: a wrong value on a disabled
      // switch is indistinguishable from a real `false`.
      const component = await mountWith(gbk, savedValue(nested, '1', 'gbk'), 'display')
      expect(component.html()).toContain('disabled')
      expect(isOn(component.html())).toBe(true)
    })
  })

  describe('22.05, where the saved value is a string', () => {
    const adjust = declaredParameter(ccqtl, '5', 'adjust', 'boolean')

    it('shows off for a saved "false"', async () => {
      expect(savedValue(ccqtl, '5', 'adjust')).toBe('false')
      const component = await mountWith(adjust, savedValue(ccqtl, '5', 'adjust'))
      expect(isOn(component.html())).toBe(false)
    })

    it('shows on for a saved "true"', async () => {
      // Hand-written: the recording holds only the `false` side of this
      // parameter, and no other 22.05 recording has a boolean at all. The
      // declaration is still the recorded one.
      const component = await mountWith(adjust, 'true')
      expect(isOn(component.html())).toBe(true)
    })
  })

  describe('values the switch has no position for', () => {
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

    it('reads a number the way string_as_bool would', async () => {
      // Hand-written, and no recording carries it: Galaxy's own `to_json`
      // never writes a number for a boolean. It is here because
      // `WorkflowParameterValue` admits one and `string_as_bool` compares
      // `str(string).lower()`, so `1` is on and `0` is off — the widget
      // agrees with `to_python` rather than refusing the shape.
      expect(isOn((await mountWith(gbk, 1)).html())).toBe(true)
      expect(isOn((await mountWith(gbk, 0)).html())).toBe(false)
    })
  })

  describe('what the form submits, which this change leaves alone', () => {
    it('emits the state spelling and never truevalue', async () => {
      // `from_json` is `to_python` is `string_as_bool` (`basic.py:565` at
      // 22.05, `:662` at 26.1), so `'true'` is read as true on both releases
      // while `'--gbk'` would be read as false. Asserted against the
      // recorded declaration precisely because its `truevalue` is the one
      // that would be wrong.
      const off = await mountWith(gbk, false)
      await off.find('button[role="switch"]').trigger('click')
      expect(off.emitted('update:modelValue')).toEqual([['true']])

      const on = await mountWith(gbk, savedValue(nested, '1', 'gbk'))
      await on.find('button[role="switch"]').trigger('click')
      expect(on.emitted('update:modelValue')).toEqual([['false']])
    })
  })
})
