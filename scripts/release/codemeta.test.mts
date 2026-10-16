import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import { readVersion, writeVersion } from './codemeta.mts'

const codemeta = readFileSync(new URL('../../codemeta.json', import.meta.url), 'utf8')

describe('the codemeta.json updater', () => {
  it('writes the release\'s version and the day it was cut', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-02T09:30:00Z') })

    const bumped = writeVersion(codemeta, '0.0.4')

    assert.equal(readVersion(bumped), '0.0.4')
    assert.equal(JSON.parse(bumped).dateModified, '2026-11-02')
  })

  it('changes no other line of codemeta.json, so a release commit shows only the bump', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-02T09:30:00Z') })
    const before = codemeta.split('\n')
    const after = writeVersion(codemeta, '0.0.4').split('\n')

    assert.equal(after.length, before.length)
    const changed = after.filter((line, index) => line !== before[index])
    assert.deepEqual(changed.map(line => line.trim().split(':')[0]), ['"version"', '"dateModified"'])
  })

  // commit-and-tag-version resolves an updater's path from the working
  // directory, which is the repository root under `pnpm release:check`.
  it('is the updater commit-and-tag-version loads for codemeta.json from .versionrc.json', () => {
    const { bumpFiles } = JSON.parse(readFileSync(new URL('../../.versionrc.json', import.meta.url), 'utf8')) as { bumpFiles: (string | { filename: string })[] }
    const entry = bumpFiles.find(file => typeof file !== 'string' && file.filename === 'codemeta.json')
    assert.ok(entry, '.versionrc.json bumps no codemeta.json')

    const { resolveUpdaterObjectFromArgument } = createRequire(import.meta.url)('commit-and-tag-version/lib/updaters/index.js') as {
      resolveUpdaterObjectFromArgument: (entry: unknown) => false | { updater: { readVersion: typeof readVersion, writeVersion: typeof writeVersion } }
    }
    const resolved = resolveUpdaterObjectFromArgument(entry)
    assert.ok(resolved, 'commit-and-tag-version found no updater for codemeta.json')
    assert.equal(resolved.updater.readVersion(resolved.updater.writeVersion(codemeta, '0.0.4')), '0.0.4')
  })
})
