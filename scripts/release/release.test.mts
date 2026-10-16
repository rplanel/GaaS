import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { releasedPackages } from './release.mts'

function writeJson(root: string, file: string, value: unknown): void {
  mkdirSync(join(root, file, '..'), { recursive: true })
  writeFileSync(join(root, file), JSON.stringify(value))
}

describe('releasedPackages', () => {
  it('reads the packages a release bumps, and no other file it bumps', () => {
    const root = mkdtempSync(join(tmpdir(), 'released-packages-'))
    writeJson(root, '.versionrc.json', {
      bumpFiles: [
        'package.json',
        'packages/blendtype/package.json',
        { filename: 'codemeta.json', updater: 'scripts/release/codemeta.mts' },
      ],
    })
    writeJson(root, 'package.json', { name: 'gaas', version: '0.0.4', private: true })
    writeJson(root, 'packages/blendtype/package.json', { name: 'blendtype', version: '0.0.4' })
    writeJson(root, 'codemeta.json', { name: 'GaaS', version: '0.0.4' })

    assert.deepEqual(releasedPackages(root), [
      { name: 'gaas', version: '0.0.4', private: true },
      { name: 'blendtype', version: '0.0.4', private: false },
    ])
  })
})
