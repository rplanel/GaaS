import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { packageVersionOf } from './repos.mts'

const POSTINSTALL = fileURLToPath(new URL('postinstall.mjs', import.meta.url))
const LOCKFILE = fileURLToPath(new URL('../../pnpm-lock.yaml', import.meta.url))

/**
 * A checkout of GaaS's own lockfile on a machine whose cache holds effect at
 * the package version that lockfile names, and nothing else.
 */
function machine(t: TestContext): { checkout: string, xdgCache: string, effect: string } {
  const root = mkdtempSync(join(tmpdir(), 'gaas-postinstall-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const checkout = join(root, 'checkout')
  const xdgCache = join(root, 'xdg-cache')
  mkdirSync(checkout)
  copyFileSync(LOCKFILE, join(checkout, 'pnpm-lock.yaml'))
  const effect = join(xdgCache, 'gaas/repos', `effect@${packageVersionOf(readFileSync(LOCKFILE, 'utf8'), 'effect')}`)
  mkdirSync(effect, { recursive: true })
  return { checkout, xdgCache, effect }
}

/** Run the postinstall step as `pnpm install` does: from the checkout's root. */
function postinstall(checkout: string, env: Record<string, string>): ReturnType<typeof spawnSync> {
  const { CI: _ci, ...outsideCi } = process.env
  return spawnSync(process.execPath, [POSTINSTALL], { cwd: checkout, env: { ...outsideCi, ...env }, encoding: 'utf8' })
}

describe('postinstall', () => {
  it('links what is downloaded and fails nothing for what is not', (t) => {
    const { checkout, xdgCache, effect } = machine(t)

    const run = postinstall(checkout, { XDG_CACHE_HOME: xdgCache })

    assert.equal(run.status, 0, String(run.stderr))
    assert.equal(readlinkSync(join(checkout, 'repos/effect')), effect)
    assert.equal(existsSync(join(checkout, 'repos/zod')), false)
  })

  it('neither links nor fails in CI', (t) => {
    const { checkout, xdgCache } = machine(t)

    const run = postinstall(checkout, { CI: 'true', XDG_CACHE_HOME: xdgCache })

    assert.equal(run.status, 0, String(run.stderr))
    assert.equal(existsSync(join(checkout, 'repos')), false)
  })
})
