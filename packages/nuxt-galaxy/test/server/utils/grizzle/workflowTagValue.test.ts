import { describe, expect, it } from 'vitest'
import { canNameResultsViewDirectory, WORKFLOW_TAG_VALUE_PATTERN } from '../../../../src/runtime/server/utils/grizzle/workflowTagValue'

describe('canNameResultsViewDirectory', () => {
  // Case is kept: `satelliteFinder` has to reach `name_key` as tagged, since
  // the directory that holds its results view is matched exactly (ADR 0003).
  it.each([
    'satelliteFinder',
    '0.11',
    '2.0.0',
    'my_workflow-v2',
    'A',
  ])('accepts %j', (value) => {
    expect(canNameResultsViewDirectory(value)).toBe(true)
  })

  it.each([
    ['a path separator', 'nf-core/epitopeprediction'],
    ['a plus sign, as Galaxy tool versions carry', '1.0+galaxy1'],
    ['a leading dot, which would hide the directory', '.hidden'],
    ['a leading hyphen', '-x'],
    ['nothing at all', ''],
    ['a space', 'a b'],
    ['a letter outside ASCII', 'é'],
  ])('refuses %s: %j', (_reason, value) => {
    expect(canNameResultsViewDirectory(value)).toBe(false)
  })

  it('agrees with the pattern ADR 0003 states on every value above', () => {
    // the module spells the rule the way the lint rules ask, so the two
    // spellings are checked against each other rather than byte for byte
    // eslint-disable-next-line regexp/prefer-w, regexp/use-ignore-case -- the ADR's spelling, kept verbatim on purpose
    const adrPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
    for (const value of ['satelliteFinder', '0.11', '2.0.0', 'my_workflow-v2', 'A', 'nf-core/epitopeprediction', '1.0+galaxy1', '.hidden', '-x', '', 'a b', 'é', 'ǅ1']) {
      expect(WORKFLOW_TAG_VALUE_PATTERN.test(value), value).toBe(adrPattern.test(value))
    }
  })
})
