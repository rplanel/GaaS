import { describe, expect, it } from 'vitest'
import { generateWorkflowSlug, toWorkflowComponentName } from '../../../../src/runtime/server/utils/grizzle/workflowSlug'

describe('generateWorkflowSlug', () => {
  it('slugifies a basic name and appends the version', () => {
    expect(generateWorkflowSlug('My Workflow', '1')).toBe('my-workflow-1')
  })

  it('handles names with multiple spaces', () => {
    expect(generateWorkflowSlug('Satellite Finder', '2')).toBe('satellite-finder-2')
  })

  it('collapses consecutive non-alphanumeric chars into a single hyphen', () => {
    expect(generateWorkflowSlug('My   Workflow', '1')).toBe('my-workflow-1')
    expect(generateWorkflowSlug('My--Workflow', '1')).toBe('my-workflow-1')
    expect(generateWorkflowSlug('My !! Workflow', '1')).toBe('my-workflow-1')
  })

  it('strips leading and trailing hyphens', () => {
    expect(generateWorkflowSlug('!My Workflow!', '1')).toBe('my-workflow-1')
    expect(generateWorkflowSlug('-My Workflow-', '1')).toBe('my-workflow-1')
  })

  it('prefixes "w-" when the slug starts with a digit', () => {
    expect(generateWorkflowSlug('123 Workflow', '1')).toBe('w-123-workflow-1')
    expect(generateWorkflowSlug('1-Workflow', '2')).toBe('w-1-workflow-2')
  })

  it('handles names that already contain digits', () => {
    expect(generateWorkflowSlug('Workflow V2 Beta', '3')).toBe('workflow-v2-beta-3')
    expect(generateWorkflowSlug('My123Workflow', '1')).toBe('my123workflow-1')
  })

  it('accepts version strings with dots and semver-style values', () => {
    expect(generateWorkflowSlug('My Tool', '1.0.0')).toBe('my-tool-1.0.0')
    expect(generateWorkflowSlug('My Tool', '2.0')).toBe('my-tool-2.0')
  })

  it('sanitizes version strings for safe HTML tag names', () => {
    expect(generateWorkflowSlug('My Tool', '2.0.0+galaxy1')).toBe('my-tool-2.0.0-galaxy1')
    expect(generateWorkflowSlug('Defense Finder', '200+galaxy1')).toBe('defense-finder-200-galaxy1')
    expect(generateWorkflowSlug('My Tool', '1.0.0@beta')).toBe('my-tool-1.0.0-beta')
    expect(generateWorkflowSlug('My Tool', '1.0.0#123')).toBe('my-tool-1.0.0-123')
    expect(generateWorkflowSlug('My Tool', '1.0.0!')).toBe('my-tool-1.0.0')
  })

  it('truncates slugs that would exceed 255 characters', () => {
    const longName = 'a'.repeat(300)
    const version = '1.0.0'
    const result = generateWorkflowSlug(longName, version)

    // Total length should not exceed 255
    expect(result.length).toBeLessThanOrEqual(255)
    // Should end with the version
    expect(result.endsWith('-1.0.0')).toBe(true)
    // The slug part (before the last hyphen) should be truncated
    const slugPart = result.slice(0, -(version.length + 1)) // -1 for the separator hyphen
    expect(slugPart.length).toBeLessThan(300)
  })

  it('throws when the name contains no alphanumeric characters', () => {
    expect(() => generateWorkflowSlug('!!!', '1')).toThrow('contains no alphanumeric characters')
    expect(() => generateWorkflowSlug('   ', '1')).toThrow('contains no alphanumeric characters')
    expect(() => generateWorkflowSlug('---', '1')).toThrow('contains no alphanumeric characters')
  })

  it('throws when the name is too long and truncates to nothing after slugification', () => {
    // A name that when truncated for max length results in an empty slug
    // 255 max - 1 separator - version length
    const version = '1'.padStart(260, '0') // version longer than max slug length
    const name = 'short'
    expect(() => generateWorkflowSlug(name, version)).toThrow('too long')
  })

  it('handles empty name after slugification edge case with digit prefix', () => {
    // "1" slugifies to "w-1" which is valid
    expect(generateWorkflowSlug('1', '1')).toBe('w-1-1')
  })
})

describe('toWorkflowComponentName', () => {
  it('converts a kebab-case slug to PascalCase', () => {
    expect(toWorkflowComponentName('satellite-finder-2')).toBe('SatelliteFinder2')
  })

  it('handles slugs with the w- digit prefix', () => {
    expect(toWorkflowComponentName('w-123-workflow-1')).toBe('W123Workflow1')
  })

  it('handles slugs with dotted version suffixes', () => {
    expect(toWorkflowComponentName('my-tool-1.0.0')).toBe('MyTool1.0.0')
  })

  it('handles sanitized build metadata in the component name', () => {
    expect(toWorkflowComponentName('my-tool-2.0.0-galaxy1')).toBe('MyTool2.0.0Galaxy1')
    expect(toWorkflowComponentName('defense-finder-200-galaxy1')).toBe('DefenseFinder200Galaxy1')
  })

  it('handles a single-part slug', () => {
    expect(toWorkflowComponentName('workflow')).toBe('Workflow')
  })

  it('handles a slug containing only a number', () => {
    expect(toWorkflowComponentName('123')).toBe('123')
  })

  it('preserves existing case in the hyphenated parts', () => {
    // toWorkflowComponentName does not lower-case; it capitalizes first char of each part
    expect(toWorkflowComponentName('my-WORKFLOW-1')).toBe('MyWORKFLOW1')
  })
})
