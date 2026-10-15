/**
 * Whether a release is really on npm, asked of the registry itself (ADR 0006).
 *
 * `node scripts/release/confirm-published.mts v0.0.4-beta.5 beta` succeeds
 * once every published package has that version and its `beta` dist-tag
 * points at it. The publish workflow runs it last, so a run that reports
 * success has been seen from the outside.
 *
 * Every request bypasses the registry's cache. On 2026-10-15 both `npm view`
 * and a plain GET answered "not published" for minutes after a package
 * release had gone out.
 */

import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { releasedPackages } from './dist-tag.mts'

/** The part of an npm packument read here. */
export interface Packument {
  readonly 'versions'?: Readonly<Record<string, unknown>>
  readonly 'dist-tags'?: Readonly<Record<string, string>>
}

/** Why the release is not out yet, or `undefined` once it is. */
export function notYetOut(packument: Packument, version: string, distTag: string): string | undefined {
  if (packument.versions?.[version] === undefined) {
    return `${version} is not on the registry yet`
  }
  const tagged = packument['dist-tags']?.[distTag]
  if (tagged !== version) {
    return `${distTag} points at ${tagged ?? 'nothing'}, not ${version}`
  }
  return undefined
}

async function fetchPackument(name: string): Promise<Packument> {
  const url = `https://registry.npmjs.org/${name.replace('/', '%2F')}?nocache=${Date.now()}`
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json' } })
  if (!response.ok) {
    return {}
  }
  return await response.json() as Packument
}

/** Ten seconds apart, for five minutes. */
const ATTEMPTS = 30
const INTERVAL_MS = 10_000

if (import.meta.main) {
  const [tag = '', distTag = ''] = process.argv.slice(2)
  const version = tag.replace(/^v/, '')
  const names = releasedPackages(process.cwd()).filter(pkg => !pkg.private).map(pkg => pkg.name)

  let waiting = new Map(names.map(name => [name, 'not asked yet']))
  for (let attempt = 1; attempt <= ATTEMPTS && waiting.size > 0; attempt++) {
    const answers = await Promise.all([...waiting.keys()].map(async name => [name, notYetOut(await fetchPackument(name), version, distTag)] as const))
    for (const [name, reason] of answers) {
      if (reason === undefined) {
        process.stdout.write(`${name}@${version} is on npm under ${distTag}\n`)
      }
    }
    waiting = new Map(answers.filter((answer): answer is readonly [string, string] => answer[1] !== undefined))
    if (waiting.size > 0 && attempt < ATTEMPTS) {
      await sleep(INTERVAL_MS)
    }
  }

  for (const [name, reason] of waiting) {
    process.stderr.write(`${name}: ${reason}\n`)
  }
  process.exitCode = waiting.size > 0 ? 1 : 0
}
