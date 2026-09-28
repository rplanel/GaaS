/**
 * That the declared types admit the values the recordings really carry (#102).
 *
 * The three types #102 names each said a value could not be a shape Galaxy
 * really sends, so code written against them was wrong and the compiler
 * agreed with it: #97's walker had to be written structurally over `unknown`
 * and its fixtures cast at `tool_inputs`, because the declared types could
 * not express the shapes the assertions were about. A cast in a test is a
 * checked thing turned off, and three of them in one file is the type system
 * being routed around.
 *
 * **How this file asserts.** Nothing here reads a payload through
 * `loadFixture`'s own annotation — that is a cast, and a cast asserts
 * nothing. Every payload is walked as `unknown` and handed to a function
 * whose *return type is the declared type*. That splits the claim in two, and
 * neither half can be satisfied by loosening the other:
 *
 * - a shape the declared union cannot express is a **compile** error here, on
 *   the `return` that tried to produce it;
 * - a shape the walk does not name at all is a **`TypeError`** at run time,
 *   carrying the path in the payload where it was found.
 *
 * Together they are what makes a green run mean "the declared type really
 * admits this recording". Widening `admit`'s return type would make the first
 * half vacuous, so it stays annotated.
 *
 * Measured against the three defects: put the old types back and every one of
 * them is a compile error in this file — one on each of `admit`'s marker
 * branch, `admitRepeatInstances`'s instance, and `admitDataParameterValue`'s
 * `null`, with `admit`'s scalar and `admitList`'s `number[]` alongside them.
 *
 * The marker is the one worth spelling out, because the ticket reads it
 * slightly wrong. A bare `{"__class__": "RuntimeValue"}` **object literal**
 * was always admitted: `WorkflowConditionalParametersValue` is an index
 * signature of the same union, `'RuntimeValue'` is a `string`, so it fitted.
 * A *value of type* `WorkflowRuntimeValue` did not, because an interface gets
 * no implicit index signature. So naming the concept is what makes the
 * compiler see it at all — which is the case for criterion 1 rather than an
 * aside on it, and why this walk returns the named type and not a literal.
 *
 * **Out of scope, and still contradicted.** `GalaxyBooleanToolParameter.value`
 * is `string` where `integron_finder` declares `false`,
 * `GalaxyBaseSelectToolParameter.value` cannot be the `null`
 * `type_replicon` carries, and `text`, `repeat`, `section` and
 * `data_collection` are absent from `GalaxyToolParameterType` altogether.
 * Only the data parameter's `value` is #102's; the parameter *kinds* belong
 * to the section/repeat ticket, which is why the walk below reaches a data
 * parameter through a section or a repeat without typing the section or the
 * repeat itself.
 */

import type {
  GalaxyDataToolParameter,
  GalaxyDataToolValue,
  WorkflowConditionalParametersValue,
  WorkflowParameterValue,
  WorkflowRepeatInstanceValue,
  WorkflowRuntimeValue,
} from 'blendtype'
import { describe, expect, it } from 'vitest'
import { FIXTURES, loadFixture } from './fixtures'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown[]): value is string[] {
  return value.every(entry => typeof entry === 'string')
}

function isNumberArray(value: unknown[]): value is number[] {
  return value.every(entry => typeof entry === 'number')
}

function isRecordArray(value: unknown[]): value is Record<string, unknown>[] {
  return value.every(entry => isRecord(entry))
}

/** Both spellings, because `is_runtime_value` answers true for both. */
function isRuntimeValue(value: unknown): value is WorkflowRuntimeValue {
  return isRecord(value) && (value.__class__ === 'RuntimeValue' || value.__class__ === 'ConnectedValue')
}

/** A `{values: […]}` dataset literal, which is what a tool form's value looks like. */
function isDatasetValue(value: unknown): value is GalaxyDataToolValue {
  return isRecord(value)
    && Array.isArray(value.values)
    && value.values.every(entry => isRecord(entry) && typeof entry.id === 'string' && typeof entry.src === 'string')
}

/** Enough of a value to name it in a failure, without pasting a whole repeat into the output. */
function preview(value: unknown): string {
  const json = JSON.stringify(value) ?? String(value)
  return json.length > 120 ? `${json.slice(0, 117)}…` : json
}

/** How many values the walk placed, so a walk that quietly finds nothing cannot pass. */
let placed = 0

/**
 * One recorded value, retyped as `WorkflowParameterValue`.
 *
 * Every `return` is the assertion; the `throw` is the other half of it. The
 * order of the branches is the order the union declares its members, and the
 * plain-nesting branch is last because it is the widest.
 */
function admit(where: string, value: unknown): WorkflowParameterValue {
  placed += 1
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (isRuntimeValue(value)) {
    return value
  }
  if (Array.isArray(value)) {
    return admitList(where, value)
  }
  if (isRecord(value)) {
    const nested: WorkflowConditionalParametersValue = {}
    for (const [name, inner] of Object.entries(value)) {
      nested[name] = admit(`${where}.${name}`, inner)
    }
    return nested
  }
  throw new TypeError(`${where}: no member of WorkflowParameterValue admits ${preview(value)}`)
}

/**
 * A list, retyped as the narrowest of the measured list shapes that fits.
 *
 * `WorkflowParameterValue[]` would admit every one of these in one line, and
 * that is what the declared union says. This walk is narrower on purpose:
 * naming the four shapes the recordings hold is what lets a re-recording
 * carrying a fifth — a mixed list, a list of lists — fail a test instead of
 * passing silently.
 *
 * Empty first, because an empty list is every one of them at once and nothing
 * distinguishes it. `fan-in` step 21 has one.
 */
function admitList(where: string, values: unknown[]): WorkflowParameterValue[] {
  if (values.length === 0) {
    return []
  }
  if (isStringArray(values)) {
    return values
  }
  if (isNumberArray(values)) {
    return values
  }
  if (values.every(entry => isRecord(entry) && typeof entry.__index__ === 'number')) {
    return admitRepeatInstances(where, values)
  }
  if (isRecordArray(values)) {
    return admitNestedList(where, values)
  }
  throw new TypeError(`${where}: the recordings hold no list shaped like ${preview(values)}`)
}

/**
 * A repeat's instances, retyped as `WorkflowRepeatInstanceValue[]`.
 *
 * `__index__` is read off the instance and never taken from its position: a
 * repeat whose middle entry was deleted keeps the gap, and the connection is
 * keyed by the index that survived (#97). That it is a `number` and not a
 * string is the part the type states and this checks.
 */
function admitRepeatInstances(where: string, values: unknown[]): WorkflowRepeatInstanceValue[] {
  return values.map((entry, position) => {
    const at = `${where}[${position}]`
    if (!isRecord(entry) || typeof entry.__index__ !== 'number') {
      throw new TypeError(`${at}: no member of WorkflowParameterValue admits ${preview(entry)}`)
    }
    const instance: WorkflowRepeatInstanceValue = { __index__: entry.__index__ }
    for (const [name, inner] of Object.entries(entry)) {
      if (name === '__index__') {
        continue
      }
      instance[name] = admit(`${at}.${name}`, inner)
    }
    return instance
  })
}

/**
 * A list of plain objects that are not repeat instances.
 *
 * Galaxy has no such parameter kind: this is a tool's own form writing its
 * own JSON into `tool_state`. `__APPLY_RULES__` is the measured one — its
 * `rules` and `mapping` each hold a list of rule objects with no `__index__`,
 * carrying `number`s, `null`s and a `RuntimeValue` marker of their own — and
 * only the *export* shows it, because the two steps that run it are inside
 * `subworkflow-nested`'s subworkflows, where the live payload says
 * `tool_inputs: null`.
 */
function admitNestedList(where: string, values: Record<string, unknown>[]): WorkflowConditionalParametersValue[] {
  return values.map((entry, position) => {
    const at = `${where}[${position}]`
    const nested: WorkflowConditionalParametersValue = {}
    for (const [name, inner] of Object.entries(entry)) {
      nested[name] = admit(`${at}.${name}`, inner)
    }
    return nested
  })
}

/** One recorded data parameter's `value`, retyped as the declared type. */
function admitDataParameterValue(where: string, value: unknown): GalaxyDataToolParameter['value'] {
  placed += 1
  if (value === null) {
    return value
  }
  if (isDatasetValue(value)) {
    return value
  }
  throw new TypeError(`${where}: GalaxyDataToolParameter['value'] does not admit ${preview(value)}`)
}

// -------------------------------------------------------------- the payloads

/** The message of every value the walk could not place, one per saved state. */
function refusals(states: { where: string, state: unknown }[]): string[] {
  const refused: string[] = []
  for (const { where, state } of states) {
    if (state === null || state === undefined) {
      // `null` on a subworkflow step, which ran no tool and saved no state.
      continue
    }
    try {
      if (!isRecord(state)) {
        throw new TypeError(`${where}: a saved tool state is not an object: ${preview(state)}`)
      }
      for (const [name, value] of Object.entries(state)) {
        admit(`${where} · ${name}`, value)
      }
    }
    catch (error) {
      refused.push(error instanceof Error ? error.message : String(error))
    }
  }
  return refused
}

/** Every step's saved state as the live payload carries it: the decoded column, per step. */
function liveStates(live: unknown): { where: string, state: unknown }[] {
  const steps = isRecord(live) && isRecord(live.steps) ? live.steps : {}
  return Object.entries(steps).map(([stepId, step]) => ({
    where: `step ${stepId}`,
    state: isRecord(step) ? step.tool_inputs : undefined,
  }))
}

/**
 * The same, as the stored definition carries it: `tool_state`, a JSON
 * **string** of `state.encode(nested=True)`, which is what the description
 * endpoint decodes and hands on as `DescribedStep.tool_inputs` since #88 —
 * so this is the reading production actually depends on.
 *
 * Recursive, because a subworkflow step embeds a whole export and its steps
 * carry their own states. `subworkflow-nested` is the recording that has
 * them, and it is the one whose live payload says `tool_inputs: null`.
 */
function exportStates(exported: unknown, prefix = 'step'): { where: string, state: unknown }[] {
  const steps = isRecord(exported) && isRecord(exported.steps) ? exported.steps : {}
  const states: { where: string, state: unknown }[] = []
  for (const [stepId, step] of Object.entries(steps)) {
    if (!isRecord(step)) {
      continue
    }
    const where = `${prefix} ${stepId}`
    if (typeof step.tool_state === 'string') {
      // Galaxy dumps "the last known state without modifications" for a tool
      // it no longer holds, so an unparseable string is a recording of that
      // rather than a shape to refuse.
      try {
        states.push({ where, state: JSON.parse(step.tool_state) })
      }
      catch {
        states.push({ where, state: undefined })
      }
    }
    if (step.subworkflow !== null && step.subworkflow !== undefined) {
      states.push(...exportStates(step.subworkflow, `${where} ›`))
    }
  }
  return states
}

/**
 * Every data parameter a recorded tool declares, by Galaxy's own prefixed
 * name, with the `value` it was recorded with.
 *
 * The walk is structural and over `unknown` for the reason
 * `unconnectedDatasetInputs` is: a data parameter sits inside a conditional's
 * case, a repeat block or a section, and only the first of those three is in
 * `GalaxyToolParameters` at all.
 */
function dataParameterValues(tool: unknown, prefix = ''): { where: string, value: unknown }[] {
  const nodes = isRecord(tool) && Array.isArray(tool.inputs) ? tool.inputs : []
  const found: { where: string, value: unknown }[] = []
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.name !== 'string') {
      continue
    }
    const name = `${prefix}${node.name}`
    if (node.type === 'data') {
      found.push({ where: name, value: node.value })
      continue
    }
    if (node.type === 'section' || node.type === 'repeat') {
      found.push(...dataParameterValues(node, `${name}|`))
      continue
    }
    if (node.type === 'conditional') {
      // Every case, not the one a revision happens to be on: this is about
      // what the tool declares, and each case declares its own parameters.
      const cases = Array.isArray(node.cases) ? node.cases : []
      for (const one of cases) {
        found.push(...dataParameterValues(one, `${name}|`))
      }
    }
  }
  return found
}

// ----------------------------------------------------------------- the suite

describe('the saved tool state of every recorded step is a WorkflowToolParameters', () => {
  for (const slug of Object.values(FIXTURES)) {
    const fixture = loadFixture(slug)

    it(`${slug} — the live payload`, () => {
      placed = 0
      expect(refusals(liveStates(fixture.live))).toEqual([])
      expect(placed).toBeGreaterThan(0)
    })

    it(`${slug} — the stored definition`, () => {
      placed = 0
      expect(refusals(exportStates(fixture.exported))).toEqual([])
      expect(placed).toBeGreaterThan(0)
    })
  }
})

describe('the value of every recorded data parameter is one its declared type admits', () => {
  for (const slug of Object.values(FIXTURES)) {
    const fixture = loadFixture(slug)
    // `fan-in` and `subworkflow-nested` were recorded `--no-tools`: what they
    // pin lives in the step shape and the connections and never reaches a
    // tool definition. Asserting on them here would pass on an empty set.
    if (!fixture.manifest.toolsRecorded) {
      continue
    }

    it(`${slug} — every data parameter of every tool it pins`, () => {
      placed = 0
      const refused: string[] = []
      for (const [toolKey, tool] of Object.entries(fixture.tools)) {
        for (const { where, value } of dataParameterValues(tool)) {
          try {
            admitDataParameterValue(`${toolKey} · ${where}`, value)
          }
          catch (error) {
            refused.push(error instanceof Error ? error.message : String(error))
          }
        }
      }
      expect(refused).toEqual([])
      expect(placed).toBeGreaterThan(0)
    })
  }
})
