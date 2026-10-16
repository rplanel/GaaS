import type { BumpFile } from './release.mts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readVersion, writeVersion } from './codemeta.mts'

const root = new URL('../../', import.meta.url)
const codemeta = readFileSync(new URL('codemeta.json', root), 'utf8')

describe('writeVersion', () => {
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

  // commit-and-tag-version requires an updater by its path from the working
  // directory, the repository root. This test requires it the same way, but
  // without commit-and-tag-version itself: the mirror's publish workflow runs
  // these tests before anything is installed.
  it('is what .versionrc.json has a release bump codemeta.json with, loaded with require', () => {
    const { bumpFiles } = JSON.parse(readFileSync(new URL('.versionrc.json', root), 'utf8')) as { bumpFiles: BumpFile[] }
    const entry = bumpFiles.find(file => typeof file !== 'string' && file.filename === 'codemeta.json')
    assert.ok(typeof entry === 'object' && entry.updater !== undefined, '.versionrc.json names no updater for codemeta.json')

    const updater = createRequire(import.meta.url)(fileURLToPath(new URL(entry.updater, root))) as { readVersion: typeof readVersion, writeVersion: typeof writeVersion }
    assert.equal(updater.readVersion(updater.writeVersion(codemeta, '0.0.4')), '0.0.4')
  })
})
