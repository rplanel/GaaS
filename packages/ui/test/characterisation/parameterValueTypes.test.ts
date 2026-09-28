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
 * **What each ticket settled here.** #102 fixed the three saved-*state* types
 * and checked only `data` parameters on the tool side, leaving the other two
 * `value` types listed in this header as out of its scope. #110 then fixed
 * those — a boolean's `value` is a string at 22.05 and a real boolean at 26.1,
 * and no select's `value` could be the `null` `type_replicon` carries — and
 * widened the tool-side walk from `data` parameters to _every_ parameter,
 * which is what would have caught them and why #102's narrower walk did not.
 *
 * **Still out of scope.** `text`, `repeat`, `section` and `data_collection`
 * are absent from `GalaxyToolParameterType` altogether. Those are parameter
 * _kinds_ rather than values, three of them #101's, and it is why the walk
 * below goes *through* a section or a repeat to reach what is nested inside
 * without typing the section or the repeat itself. `UNMODELLED_KINDS` is where
 * that set is pinned, so a recording bringing a fifth announces itself.
 */

import type {
  GalaxyBooleanToolParameter,
  GalaxyDataToolParameter,
  GalaxyDataToolValue,
  GalaxyFloatToolParameter,
  GalaxyIntegerToolParameter,
  GalaxyMultipleSelectToolParameter,
  GalaxySingleSelectToolParameter,
  WorkflowConditionalParametersValue,
  WorkflowParameterValue,
  WorkflowRepeatInstanceValue,
} from 'blendtype'
import type { WorkflowFixture } from './fixtures'
import { booleanToolParameterValue, isWorkflowRepeatInstanceValue, isWorkflowRuntimeValue } from 'blendtype'
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

/** A `{values: […]}` dataset literal, which is what a tool form's value looks like. */
function isDatasetValue(value: unknown): value is GalaxyDataToolValue {
  return isRecord(value)
    && Array.isArray(value.values)
    && value.values.every(entry => isRecord(entry) && typeof entry.id === 'string' && typeof entry.src === 'string')
}

/** One recorded value and where in the payload it was found, as `step 2 · datasets`. */
interface Found {
  where: string
  value: unknown
}

/** Enough of a value to name it in a failure, without pasting a whole repeat into the output. */
function preview(value: unknown): string {
  const json = JSON.stringify(value) ?? String(value)
  return json.length > 120 ? `${json.slice(0, 117)}…` : json
}

/**
 * How many values the walk placed, counted so a walk that quietly finds
 * nothing cannot pass. Threaded through the recursion rather than kept in a
 * module-level `let`: the counter is per-assertion, and shared mutable state
 * would be right only for as long as this file stays sequential.
 */
interface Tally {
  placed: number
}

/**
 * One recorded value, retyped as `WorkflowParameterValue`.
 *
 * Every `return` is the assertion; the `throw` is the other half of it. The
 * order of the branches is the order the union declares its members, and the
 * plain-nesting branch is last because it is the widest.
 */
function admit(where: string, value: unknown, tally: Tally): WorkflowParameterValue {
  tally.placed += 1
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (isWorkflowRuntimeValue(value)) {
    return value
  }
  if (Array.isArray(value)) {
    return admitList(where, value, tally)
  }
  if (isRecord(value)) {
    return admitFields(where, value, tally)
  }
  throw new TypeError(`${where}: no member of WorkflowParameterValue admits ${preview(value)}`)
}

/**
 * Every field of one object, each retyped in turn.
 *
 * The one loop the plain-nesting branch, a repeat's instance and a tool's own
 * rule object all want; `skip` is the bookkeeping key the caller has already
 * placed itself, which only the repeat has.
 */
function admitFields(
  where: string,
  value: Record<string, unknown>,
  tally: Tally,
  skip?: string,
): WorkflowConditionalParametersValue {
  const nested: WorkflowConditionalParametersValue = {}
  for (const [name, inner] of Object.entries(value)) {
    if (name === skip) {
      continue
    }
    nested[name] = admit(`${where}.${name}`, inner, tally)
  }
  return nested
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
function admitList(where: string, values: unknown[], tally: Tally): WorkflowParameterValue[] {
  if (values.length === 0) {
    return []
  }
  if (isStringArray(values)) {
    return values
  }
  if (isNumberArray(values)) {
    return values
  }
  if (values.every(entry => isWorkflowRepeatInstanceValue(entry))) {
    return admitRepeatInstances(where, values, tally)
  }
  if (isRecordArray(values)) {
    return admitNestedList(where, values, tally)
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
function admitRepeatInstances(where: string, values: unknown[], tally: Tally): WorkflowRepeatInstanceValue[] {
  return values.map((entry, position) => {
    const at = `${where}[${position}]`
    if (!isWorkflowRepeatInstanceValue(entry)) {
      throw new TypeError(`${at}: no member of WorkflowParameterValue admits ${preview(entry)}`)
    }
    const instance: WorkflowRepeatInstanceValue = {
      ...admitFields(at, entry, tally, '__index__'),
      __index__: entry.__index__,
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
function admitNestedList(
  where: string,
  values: Record<string, unknown>[],
  tally: Tally,
): WorkflowConditionalParametersValue[] {
  return values.map((entry, position) => admitFields(`${where}[${position}]`, entry, tally))
}

// ------------------------------------------- one admit per declared parameter

/** One recorded data parameter's `value`, retyped as the declared type. */
function admitDataParameterValue(where: string, value: unknown): GalaxyDataToolParameter['value'] {
  if (value === null) {
    return value
  }
  if (isDatasetValue(value)) {
    return value
  }
  throw new TypeError(`${where}: GalaxyDataToolParameter['value'] does not admit ${preview(value)}`)
}

/**
 * One recorded boolean parameter's `value`.
 *
 * Both spellings, because the wire type changed between the two releases and
 * the recordings straddle the change: `"false"` from `ccqtl_genome_scan` at
 * 22.05, nine real `false`s from `integron_finder` at 26.1 (#110).
 */
function admitBooleanParameterValue(where: string, value: unknown): GalaxyBooleanToolParameter['value'] {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value
  }
  throw new TypeError(`${where}: GalaxyBooleanToolParameter['value'] does not admit ${preview(value)}`)
}

/**
 * One recorded select parameter's `value`, against the subtype it actually is.
 *
 * Dispatched on `multiple` rather than admitted against the base, because the
 * base is not what a reader gets: `GalaxySingleSelectToolParameter` narrows
 * `value` back to `string`, and widening only the base would have left the
 * recorded `type_replicon` refused by the very interface it belongs to (#110).
 */
function admitSelectParameterValue(
  where: string,
  value: unknown,
  multiple: unknown,
): GalaxySingleSelectToolParameter['value'] | GalaxyMultipleSelectToolParameter['value'] {
  if (multiple === true) {
    if (value === null) {
      return value
    }
    if (Array.isArray(value) && isStringArray(value)) {
      return value
    }
    throw new TypeError(`${where}: GalaxyMultipleSelectToolParameter['value'] does not admit ${preview(value)}`)
  }
  if (value === null || typeof value === 'string') {
    return value
  }
  throw new TypeError(`${where}: GalaxySingleSelectToolParameter['value'] does not admit ${preview(value)}`)
}

/**
 * One recorded integer or float parameter's `value`.
 *
 * Here to keep them **string**, which is what they are on both releases:
 * `IntegerToolParameter`'s doctest asserts `('value', u'10')` and
 * `FloatToolParameter`'s `('value', u'3.141592')`, byte-identical at 22.05 and
 * 26.1, and the 26.1 recording carries `dist_thresh: "4000"`. They inherit
 * `TextToolParameter`, which 26.1 did not change the way it changed
 * `BooleanToolParameter` — so this is the assertion that would notice if a
 * later release changed them too, rather than a reader finding out (#110).
 */
function admitNumericParameterValue(
  where: string,
  value: unknown,
): GalaxyIntegerToolParameter['value'] | GalaxyFloatToolParameter['value'] {
  if (typeof value === 'string') {
    return value
  }
  throw new TypeError(`${where}: an integer or float parameter's declared value is a string, not ${preview(value)}`)
}

// -------------------------------------------------------------- the payloads

/**
 * Every saved state walked, with the message of each value the walk could not
 * place. One `try` per state, so a failure names the step it is in and the
 * other states are still walked.
 */
function walkStates(states: Found[]): { refused: string[], placed: number } {
  const refused: string[] = []
  const tally: Tally = { placed: 0 }
  for (const { where, value: state } of states) {
    if (state === null || state === undefined) {
      // `null` on a subworkflow step, which ran no tool and saved no state.
      continue
    }
    try {
      if (!isRecord(state)) {
        throw new TypeError(`${where}: a saved tool state is not an object: ${preview(state)}`)
      }
      admitFields(where, state, tally)
    }
    catch (error) {
      refused.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { refused, placed: tally.placed }
}

/** Every step's saved state as the live payload carries it: the decoded column, per step. */
function liveStates(live: unknown): Found[] {
  const steps = isRecord(live) && isRecord(live.steps) ? live.steps : {}
  return Object.entries(steps).map(([stepId, step]) => ({
    where: `step ${stepId}`,
    value: isRecord(step) ? step.tool_inputs : undefined,
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
function exportStates(exported: unknown, prefix = 'step'): Found[] {
  const steps = isRecord(exported) && isRecord(exported.steps) ? exported.steps : {}
  const states: Found[] = []
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
        states.push({ where, value: JSON.parse(step.tool_state) })
      }
      catch {
        states.push({ where, value: undefined })
      }
    }
    if (step.subworkflow !== null && step.subworkflow !== undefined) {
      states.push(...exportStates(step.subworkflow, `${where} ›`))
    }
  }
  return states
}

/** One declared parameter of a recorded tool, by Galaxy's own prefixed name. */
interface DeclaredParameter {
  where: string
  node: Record<string, unknown>
}

/**
 * Every parameter a recorded tool declares, nesting included.
 *
 * The walk is structural and over `unknown` for the reason
 * `unconnectedDatasetInputs` is: a parameter sits inside a conditional's case,
 * a repeat block or a section, and none of those three is in
 * `GalaxyToolParameters` at all (#101 owns that). Walking *through* them
 * without typing them is what lets this reach the nine parameters under
 * `integron_finder`'s `settings` section, which is where half the recorded
 * booleans and every recorded integer live.
 *
 * A conditional's `test_param` is visited too, and it is not an afterthought:
 * Galaxy requires it to be a `select` or a `boolean`, so it is exactly one of
 * the two kinds #110 is about.
 */
function declaredParameters(tool: unknown, prefix = ''): DeclaredParameter[] {
  const nodes = isRecord(tool) && Array.isArray(tool.inputs) ? tool.inputs : []
  const found: DeclaredParameter[] = []
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.name !== 'string') {
      continue
    }
    const name = `${prefix}${node.name}`
    found.push({ where: name, node })
    // Read from `model_class` and not from `type`, so this and
    // `admitDeclaredValue` below name the taxonomy once between them rather
    // than in Galaxy's two spellings of it.
    if (node.model_class === 'Section' || node.model_class === 'Repeat') {
      found.push(...declaredParameters(node, `${name}|`))
      continue
    }
    if (node.model_class === 'Conditional') {
      if (isRecord(node.test_param)) {
        found.push({ where: `${name}|${String(node.test_param.name)}`, node: node.test_param })
      }
      // Every case, not the one a revision happens to be on: this is about
      // what the tool declares, and each case declares its own parameters.
      for (const one of Array.isArray(node.cases) ? node.cases : []) {
        found.push(...declaredParameters(one, `${name}|`))
      }
    }
  }
  return found
}

/**
 * The `model_class`es this project declares no type for, and so cannot check a
 * `value` against.
 *
 * Named rather than skipped: asserted as an exact set below, so a recording
 * that brings a *new* unmodelled kind fails a test instead of being walked
 * past in silence. Every one of these is #101's — three nesting kinds and
 * `data_collection` — except `TextToolParameter`, which is simply absent from
 * `GalaxyToolParameterType` and has no ticket of its own yet.
 */
const UNMODELLED_KINDS = ['DataCollectionToolParameter', 'Repeat', 'Section', 'TextToolParameter']

/** A `model_class` whose `value` nothing here could check, or `undefined` when it was checked. */
type UncheckedKind = string | undefined

/**
 * One declared parameter's `value`, admitted against the type its
 * `model_class` names.
 *
 * Answers the `model_class` when there is no declared type to check the value
 * against, so the caller can pin that set rather than lose it — see
 * `UNMODELLED_KINDS`. A kind with a type, and a kind that carries no `value`
 * of its own, both answer `undefined`.
 */
function admitDeclaredValue(where: string, node: Record<string, unknown>, tally: Tally): UncheckedKind {
  const kind = String(node.model_class)
  const value = node.value
  if (kind === 'Conditional' || UNMODELLED_KINDS.includes(kind)) {
    // A conditional carries no `value` of its own — `test_param` does, and the
    // walk hands that over separately — so it is checked, not unchecked.
    return kind === 'Conditional' ? undefined : kind
  }
  tally.placed += 1
  switch (kind) {
    case 'DataToolParameter':
      admitDataParameterValue(where, value)
      return undefined
    case 'BooleanToolParameter': {
      const admitted = admitBooleanParameterValue(where, value)
      // And through the published reader, against every recorded boolean:
      // whichever release wrote it, a caller must end up with a boolean or
      // `null` and never the string a 22.05 payload carries — which is the
      // whole of what #110 is for. Asserted here rather than only in
      // `blendtype`'s own unit tests because this is where the values are
      // real: `"false"` from Pasteur, `false` from usegalaxy.eu.
      const read = booleanToolParameterValue({ value: admitted, optional: Boolean(node.optional) })
      if (read !== null && typeof read !== 'boolean') {
        throw new TypeError(`${where}: booleanToolParameterValue answered ${preview(read)}`)
      }
      return undefined
    }
    case 'SelectToolParameter':
      admitSelectParameterValue(where, value, node.multiple)
      return undefined
    case 'IntegerToolParameter':
    case 'FloatToolParameter':
      admitNumericParameterValue(where, value)
      return undefined
    default:
      // A kind absent from `UNMODELLED_KINDS` and from the arms above is one
      // nobody has decided about. Counted a moment ago, so undo that: it was
      // not checked against anything.
      tally.placed -= 1
      return kind
  }
}

/** Every parameter of every tool a set of recordings pins, walked once. */
function walkDeclaredValues(fixtures: WorkflowFixture[]): {
  refused: string[]
  placed: number
  unchecked: string[]
} {
  const tally: Tally = { placed: 0 }
  const refused: string[] = []
  const unchecked = new Set<string>()
  for (const fixture of fixtures) {
    for (const [toolKey, tool] of Object.entries(fixture.tools)) {
      for (const { where, node } of declaredParameters(tool)) {
        try {
          const kind = admitDeclaredValue(`${toolKey} · ${where}`, node, tally)
          if (kind !== undefined) {
            unchecked.add(kind)
          }
        }
        catch (error) {
          refused.push(error instanceof Error ? error.message : String(error))
        }
      }
    }
  }
  return { refused, placed: tally.placed, unchecked: [...unchecked].sort() }
}

// ----------------------------------------------------------------- the suite

describe('the saved tool state of every recorded step is a WorkflowToolParameters', () => {
  for (const slug of Object.values(FIXTURES)) {
    const fixture = loadFixture(slug)

    it(`${slug} — the live payload`, () => {
      const { refused, placed } = walkStates(liveStates(fixture.live))
      expect(refused).toEqual([])
      expect(placed).toBeGreaterThan(0)
    })

    it(`${slug} — the stored definition`, () => {
      const { refused, placed } = walkStates(exportStates(fixture.exported))
      expect(refused).toEqual([])
      expect(placed).toBeGreaterThan(0)
    })
  }
})

describe('the value of every recorded parameter is one its declared type admits', () => {
  for (const slug of Object.values(FIXTURES)) {
    const fixture = loadFixture(slug)
    // `fan-in` and `subworkflow-nested` were recorded `--no-tools`: what they
    // pin lives in the step shape and the connections and never reaches a
    // tool definition. Asserting on them here would pass on an empty set.
    if (!fixture.manifest.toolsRecorded) {
      continue
    }

    it(`${slug} — every parameter of every tool it pins`, () => {
      const { refused, placed, unchecked } = walkDeclaredValues([fixture])
      expect(refused).toEqual([])
      expect(placed).toBeGreaterThan(0)
      // Every kind walked past is one this project declares no type for.
      expect(unchecked.filter(kind => !UNMODELLED_KINDS.includes(kind))).toEqual([])
    })
  }
})

describe('the kinds the recordings carry that nothing here types', () => {
  it('are the four #101 and the text parameter owe, and no others', () => {
    // Across every recording at once, where the suite above asks per fixture:
    // no single one carries all four, so only the union is the whole set. Read
    // off the recordings rather than listed by hand, so a re-recording
    // bringing a fifth kind fails here rather than being walked past.
    // `Section`, `Repeat` and `DataCollectionToolParameter` are #101's;
    // `TextToolParameter` has no ticket yet and is the one worth noticing.
    const { unchecked } = walkDeclaredValues(Object.values(FIXTURES).map(loadFixture))

    expect(unchecked).toEqual(UNMODELLED_KINDS)
  })
})
