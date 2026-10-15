/**
 * Whether a package release is really on npm, asked of the registry itself
 * (ADR 0006).
 *
 * `node scripts/release/confirm-published.mts beta` succeeds once every
 * published package's own version is on npm and its `beta` dist-tag points
 * at it. The publish workflow runs it last, after the dist-tag guard has
 * checked that every package carries the tag's version, so a run that
 * reports success has been seen from the outside.
 *
 * Every request bypasses the registry's cache. On 2026-10-15 both `npm view`
 * and a plain GET answered "not published" for minutes after a package
 * release had gone out.
 */

import process from 'node:process'
import { poll } from './poll.mts'
import { releasedPackages } from './release.mts'

/** The part of an npm packument read here. */
export interface Packument {
  readonly 'versions'?: Readonly<Record<string, unknown>>
  readonly 'dist-tags'?: Readonly<Record<string, string>>
}

/** Why `version` is not out on npm under `distTag` yet, or `undefined` once it is. */
export function whyNotOnNpm(packument: Packument, version: string, distTag: string): string | undefined {
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

if (import.meta.main) {
  const distTag = process.argv[2] ?? ''
  const published = releasedPackages(process.cwd()).filter(pkg => !pkg.private)

  /** Why each package is not out yet, by name: emptied as the registry catches up. */
  const waiting = new Map(published.map(pkg => [pkg.name, 'not asked yet']))
  // Ten seconds apart, for five minutes.
  const { lastError } = await poll(30, 10_000, async () => {
    for (const pkg of published.filter(({ name }) => waiting.has(name))) {
      const reason = whyNotOnNpm(await fetchPackument(pkg.name), pkg.version, distTag)
      if (reason === undefined) {
        waiting.delete(pkg.name)
        process.stdout.write(`${pkg.name}@${pkg.version} is on npm under ${distTag}\n`)
      }
      else {
        waiting.set(pkg.name, reason)
      }
    }
    return waiting.size === 0 ? true : undefined
  })

  for (const [name, reason] of waiting) {
    process.stderr.write(`${name}: ${reason}\n`)
  }
  if (waiting.size > 0 && lastError !== undefined) {
    process.stderr.write(`The last request failed: ${(lastError as Error).message}\n`)
  }
  process.exitCode = waiting.size > 0 ? 1 : 0
}
