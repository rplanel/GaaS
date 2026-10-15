import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { distTagFor } from './dist-tag.mts'

function everyPackageAt(version: string): Record<string, string> {
  return {
    'gaas': version,
    'blendtype': version,
    'nuxt-galaxy': version,
    '@gaas/ui': version,
    '@gaas/wiki': version,
  }
}

describe('distTagFor', () => {
  it('publishes a beta to beta', () => {
    assert.equal(distTagFor('v0.0.4-beta.5', everyPackageAt('0.0.4-beta.5')), 'beta')
  })

  it('publishes a plain release to latest', () => {
    assert.equal(distTagFor('v0.1.0', everyPackageAt('0.1.0')), 'latest')
  })

  it('refuses any other prerelease, so nothing lands on latest by accident', () => {
    assert.throws(() => distTagFor('v0.1.0-rc.0', everyPackageAt('0.1.0-rc.0')), /rc\.0/)
    assert.throws(() => distTagFor('v0.1.0-alpha.1', everyPackageAt('0.1.0-alpha.1')), /alpha\.1/)
  })

  it('refuses a beta without its number', () => {
    assert.throws(() => distTagFor('v0.1.0-beta', everyPackageAt('0.1.0-beta')), /beta/)
  })

  it('names every package whose version is not the tag', () => {
    const versions = { ...everyPackageAt('0.0.4-beta.5'), 'nuxt-galaxy': '0.0.4-beta.4', '@gaas/wiki': '0.0.4' }
    assert.throws(
      () => distTagFor('v0.0.4-beta.5', versions),
      (error: Error) => error.message.includes('nuxt-galaxy 0.0.4-beta.4') && error.message.includes('@gaas/wiki 0.0.4') && !error.message.includes('blendtype'),
    )
  })

  it('refuses a tag that is not v followed by a full version', () => {
    // v1.1 and v1.2 are milestone tags, not package releases.
    assert.throws(() => distTagFor('v1.1', everyPackageAt('1.1')), /v1\.1/)
    assert.throws(() => distTagFor('0.1.0', everyPackageAt('0.1.0')), /0\.1\.0/)
    assert.throws(() => distTagFor('v0.1.0+build.1', everyPackageAt('0.1.0+build.1')), /build/)
  })
})
