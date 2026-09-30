/**
 * That a text box shows what the workflow saved and hands back what the
 * reader types (#113).
 *
 * Driven from recorded payloads for the reason `BooleanToolParameter.test.ts`
 * gives: `Step.vue` renders every widget through `<component :is>`, whose
 * props Vue does not typecheck, so a hand-written value can only carry the
 * shapes the declaration already admits. Where a value here is hand-written
 * it is because no recording holds that case, and it says so.
 *
 * Only `ccqtl-today` saved a value for a text parameter — `""`, three times.
 * The four at 26.1 sit in conditional cases their revisions are not on, so
 * the recordings hold their *declarations* only. A declaration's `value` is
 * written by the same `to_json` that writes a saved one, which is what makes
 * it usable as a saved value here, and why the tests below say which is which.
 */

import type { GalaxyTextToolParameter, GalaxyToolParameters, WorkflowParameterValue } from 'blendtype'
import type { WorkflowFixture } from '../characterisation/fixtures'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import TextToolParameter from '../../app/components/galaxy/TextToolParameter.vue'
import { FIXTURES, loadFixture, toolOfStep } from '../characterisation/fixtures'

const ccqtl = loadFixture(FIXTURES.ccqtlToday)
const nested = loadFixture(FIXTURES.conditionalRepeatRuntime)

/** The first parameter of that name at any depth, through sections, repeats and every case of a conditional. */
function declaredAnywhere(inputs: readonly GalaxyToolParameters[], name: string): GalaxyToolParameters | undefined {
  for (const input of inputs) {
    if (input.name === name) {
      return input
    }
    const nested = input.type === 'section' || input.type === 'repeat'
      ? [input.inputs]
      : input.type === 'conditional' ? input.cases.map(one => one.inputs) : []
    for (const children of nested) {
      const found = declaredAnywhere(children, name)
      if (found) {
        return found
      }
    }
  }
  return undefined
}

/**
 * The recorded declaration of one text parameter of the tool one step runs.
 *
 * Keyed off the step rather than off a literal tool id, the way the rest of
 * the suites are: a re-recording that moves to a new tool version then fails
 * with the step's own id instead of resolving to `undefined` behind a `!`.
 */
function textParameter(fixture: WorkflowFixture, step: string, name: string): GalaxyTextToolParameter {
  const tool = toolOfStep(fixture, step)
  const found = declaredAnywhere(tool.inputs, name)
  if (!found) {
    throw new Error(`${tool.id} declares no ${name}`)
  }
  if (found.type !== 'text') {
    throw new TypeError(`${name} of ${tool.id} is a ${found.type}, not a text parameter`)
  }
  return found
}

/** What the revision saved for one top-level parameter of one step. */
function savedValue(fixture: WorkflowFixture, step: string, name: string): WorkflowParameterValue {
  const inputs = fixture.live.steps[step]?.tool_inputs
  if (!inputs || !(name in inputs)) {
    throw new Error(`step ${step} of ${fixture.slug} saved no ${name}`)
  }
  return inputs[name]!
}

async function mountWith(parameter: GalaxyTextToolParameter, modelValue: WorkflowParameterValue, variant: 'form' | 'display' = 'form') {
  return mountSuspended(TextToolParameter, {
    props: { ...parameter, modelValue, variant },
  })
}

/** What the reader sees in the box. */
function boxValue(wrapper: Awaited<ReturnType<typeof mountWith>>): string {
  return (wrapper.get('input, textarea').element as HTMLInputElement | HTMLTextAreaElement).value
}

/** `ccqtl_make_inputs`'s `xp_desc`: required as declared, labelled "(optional)", saved `""`. */
const xpDesc = textParameter(ccqtl, '2', 'xp_desc')

describe('textToolParameter — the value the workflow saved', () => {
  it.each([
    // What every production run of Pasteur's workflow has sent, at 22.05.
    { fixture: ccqtl, step: '2', name: 'xp_desc', recorded: 'saved', shown: '' },
    // The one non-empty text value in the recordings, at 26.1.
    { fixture: nested, step: '3', name: 'suffix_pattern', recorded: 'declared', shown: '_#' },
    // An optional parameter with nothing filled in: `null` at 26.1, and
    // shown as an empty box rather than as the word "null".
    { fixture: nested, step: '2', name: 'identifier', recorded: 'declared', shown: '' },
  ] as const)('shows $name\'s $recorded value as "$shown"', async ({ fixture, step, name, recorded, shown }) => {
    const parameter = textParameter(fixture, step, name)
    const value = recorded === 'saved' ? savedValue(fixture, step, name) : parameter.value

    const component = await mountWith(parameter, value)

    expect(boxValue(component)).toBe(shown)
  })

  it('reads a runtime marker as an empty box rather than as the object it is', async () => {
    // Galaxy short-circuits a runtime marker before `to_python` sees it
    // (`basic.py:230` at 22.05, `:295` at 26.1), and a box has no spelling
    // for "set when the workflow runs". The marker is the one the recording
    // carries on step 1; pairing it with a text parameter is what is
    // hand-written, because no recorded workflow sets one at runtime.
    const marker = savedValue(nested, '1', 'topology_file')
    expect(marker).toEqual({ __class__: 'RuntimeValue' })

    const component = await mountWith(xpDesc, marker)

    expect(boxValue(component)).toBe('')
  })
})

describe('textToolParameter — the box it offers', () => {
  it('offers a multi-line box when the tool asks for one', async () => {
    // The flag is hand-written onto a recorded declaration: every recorded
    // text parameter declares `area: false`, so no recording shows the other
    // side of it.
    expect(xpDesc.area).toBe(false)

    const component = await mountWith({ ...xpDesc, area: true }, savedValue(ccqtl, '2', 'xp_desc'))

    expect(component.find('textarea[name="xp_desc"]').exists()).toBe(true)
    expect(component.find('input').exists()).toBe(false)
  })

  it('hands back what the reader types into the multi-line box', async () => {
    // A binding of its own, so a test of its own: the single-line box's is
    // driven through `Step.vue` in `Step.test.ts`.
    const component = await mountWith({ ...xpDesc, area: true }, savedValue(ccqtl, '2', 'xp_desc'))

    await component.get('textarea').setValue('first line\nsecond line')

    expect(component.emitted('update:modelValue')).toEqual([['first line\nsecond line']])
  })
})

describe('textToolParameter — what it says about optional', () => {
  it('says so beside the label of a parameter the tool calls optional', async () => {
    // `identifier` at 26.1, which infers the flag for a text parameter whose
    // validators accept `""` — and whose own form appends " (optional)" to
    // the title, as this does in Nuxt UI's spelling.
    const identifier = textParameter(nested, '2', 'identifier')
    expect(identifier.optional).toBe(true)

    const component = await mountWith(identifier, identifier.value)

    expect(component.get('[data-slot="hint"]').text()).toBe('Optional')
  })

  it('marks nothing on one declared required, because an empty value is not refused for it', async () => {
    // No required mark either: at 22.05 `optional: false` is only the
    // attribute's default, and Galaxy runs a text parameter's validators on
    // an empty value rather than refusing it. `xp_desc` has none, saves `""`
    // and runs that way in production, and its label says "(optional)" — a
    // mark here would tell the reader something Galaxy does not enforce.
    expect(xpDesc.optional).toBe(false)

    const component = await mountWith(xpDesc, savedValue(ccqtl, '2', 'xp_desc'))

    expect(component.find('[data-slot="hint"]').exists()).toBe(false)
  })
})

describe('textToolParameter — the read-only variant', () => {
  it('shows the saved text in a badge beside the label, with no box to type in', async () => {
    // What an analysis's jobs panel renders for a parameter it was started
    // with. `"_#"` for the reason given above: it is the one non-empty text
    // value the recordings hold.
    const suffixPattern = textParameter(nested, '3', 'suffix_pattern')

    const component = await mountWith(suffixPattern, suffixPattern.value, 'display')

    expect(component.find('input, textarea').exists()).toBe(false)
    expect(component.findComponent({ name: 'UBadge' }).text()).toBe('_#')
    expect(component.text()).toContain(suffixPattern.label)
  })
})
