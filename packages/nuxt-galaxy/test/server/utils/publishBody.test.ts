import { describe, expect, it } from 'vitest'
import { readPublishVersionBody } from '../../../src/runtime/server/utils/publishBody'

/** A body the endpoint accepts: the stored workflow, the name and the label. */
const body = { galaxyId: 'galaxy-wf-1', name: 'satelliteFinder', label: '0.11' }

const MESSAGES = {
  body: 'The request body must be a JSON object carrying `galaxyId`, `name` and `label`',
  galaxyId: '`galaxyId` must be a non-empty string',
  name: '`name` must be a non-empty string of at most 255 characters',
  label: '`label` must be a non-empty string of at most 255 characters',
  revision: '`revision` must be a non-negative integer',
} as const

/** The 400 the reader threw, or a failure saying it accepted the body. */
function refusal(input: unknown) {
  try {
    readPublishVersionBody(input)
  }
  catch (error) {
    return error as { statusCode: number, statusMessage: string }
  }
  throw new Error('expected the body to be refused')
}

describe('readPublishVersionBody', () => {
  it('accepts a body carrying the stored workflow, a name and a label, and keeps their case', () => {
    // `satelliteFinder` has to survive with its capital F: the results view
    // directory is found by the name and the label verbatim (ADR 0003)
    expect(readPublishVersionBody(body)).toEqual(body)
  })

  it('ignores unknown top-level keys rather than refusing them, so an additive client change is not a 400', () => {
    expect(readPublishVersionBody({ ...body, clientVersion: '2.0.0' })).toEqual(body)
  })

  // ADR 0004, #73. The dialog lets an administrator choose the revision the
  // version pins: the 0-based index Galaxy lists it under, the same integer
  // an invocation takes. Absent, the latest is published, as before.
  it.each([
    ['an older revision', 1],
    ['the first revision, which is 0', 0],
  ])('accepts %s and passes it on', (_label, revision) => {
    expect(readPublishVersionBody({ ...body, revision })).toEqual({ ...body, revision })
  })

  it('leaves the revision out when the body names none, so the latest is published', () => {
    expect(readPublishVersionBody(body)).not.toHaveProperty('revision')
  })

  it.each([
    ['a negative index', -1],
    ['a fraction', 1.5],
    ['a numeric string', '2'],
    ['null', null],
  ])('refuses %s as a revision with 400 and a sentence naming the field', (_label, revision) => {
    expect(refusal({ ...body, revision })).toMatchObject({ statusCode: 400, statusMessage: MESSAGES.revision })
  })

  it.each([
    ['no body at all', undefined, MESSAGES.body],
    ['a body that is not an object', 'galaxy-wf-1', MESSAGES.body],
    ['no galaxyId', { name: body.name, label: body.label }, MESSAGES.galaxyId],
    ['a blank galaxyId', { ...body, galaxyId: '   ' }, MESSAGES.galaxyId],
    ['no name', { galaxyId: body.galaxyId, label: body.label }, MESSAGES.name],
    ['a blank name', { ...body, name: '  ' }, MESSAGES.name],
    ['no label', { galaxyId: body.galaxyId, name: body.name }, MESSAGES.label],
    ['a label that is not a string', { ...body, label: 0.11 }, MESSAGES.label],
  ])('refuses %s with 400 and a sentence naming the field', (_label, input, message) => {
    expect(refusal(input)).toMatchObject({ statusCode: 400, statusMessage: message })
  })

  // The name and the label name the directory a results view lives in, so
  // each has to be a legal directory name (ADR 0003). The rule used to be
  // checked against Galaxy tags and answered 422, since the fix was in
  // Galaxy; the administrator now types both in the publish dialog, so a
  // value that fails is a body the caller can fix, refused as a body is.
  it.each([
    ['name', 'nf-core/epitopeprediction'],
    ['name', '.hidden'],
    ['label', 'a b'],
  ])('refuses a %s that cannot name a results view directory, naming the field and the rule', (field, value) => {
    const refused = refusal({ ...body, [field]: value })

    expect(refused.statusCode).toBe(400)
    expect(refused.statusMessage).toContain(`\`${field}\` cannot name a results view directory`)
    expect(refused.statusMessage).toContain('letters, digits, dots, hyphens, plus signs and underscores')
  })

  // A `+` is legal in a directory name, literal in a URL path segment and
  // nothing to a prop, and the results view fixtures already hold a
  // `satelliteFinder/0.10+galaxy2` directory the scanner finds and the matcher
  // matches. Galaxy's `version:` tag almost always carries `+galaxyN`, so the
  // pre-fill used to hit the refusal every time.
  it('accepts a label with a plus sign, as Galaxy tool versions carry, and keeps it intact', () => {
    expect(readPublishVersionBody({ ...body, label: '0.10+galaxy2' })).toEqual({ ...body, label: '0.10+galaxy2' })
    expect(readPublishVersionBody({ ...body, name: 'satellite+finder' })).toEqual({ ...body, name: 'satellite+finder' })
  })
})
