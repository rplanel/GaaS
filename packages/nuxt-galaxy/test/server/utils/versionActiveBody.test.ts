import { describe, expect, it } from 'vitest'
import { readVersionActiveBody } from '../../../src/runtime/server/utils/versionActiveBody'

const MESSAGES = {
  body: 'The request body must be a JSON object carrying `active`',
  active: '`active` must be a boolean: false retires the version, true makes it active again',
} as const

/** The 400 the reader threw, or a failure saying it accepted the body. */
function refusal(input: unknown) {
  try {
    readVersionActiveBody(input)
  }
  catch (error) {
    return error as { statusCode: number, statusMessage: string }
  }
  throw new Error('expected the body to be refused')
}

describe('readVersionActiveBody', () => {
  it.each([
    ['retire', false],
    ['make active again', true],
  ])('accepts a body carrying `active` to %s', (_label, active) => {
    expect(readVersionActiveBody({ active })).toEqual({ active })
  })

  it('ignores unknown top-level keys rather than refusing them, so an additive client change is not a 400', () => {
    expect(readVersionActiveBody({ active: false, reason: 'superseded' })).toEqual({ active: false })
  })

  it.each([
    ['no body at all', undefined, MESSAGES.body],
    ['a body that is not an object', 'false', MESSAGES.body],
    ['no active', {}, MESSAGES.active],
    ['an active that is a string', { active: 'false' }, MESSAGES.active],
    ['an active that is a number', { active: 0 }, MESSAGES.active],
  ])('refuses %s with 400 and a sentence naming the field', (_label, input, message) => {
    expect(refusal(input)).toMatchObject({ statusCode: 400, statusMessage: message })
  })
})
