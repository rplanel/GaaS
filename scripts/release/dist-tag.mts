/**
 * The npm dist-tag a release tag publishes to, or a refusal (ADR 0006).
 *
 * `node scripts/release/dist-tag.mts v0.0.4-beta.5` prints `beta`. The
 * publish workflow runs it before anything is uploaded, so a tag that
 * disagrees with the packages, or a prerelease nobody decided where to put,
 * fails the run instead of reaching npm.
 */

import process from 'node:process'
import { releasedPackages } from './release.mts'

/**
 * `beta` for `vX.Y.Z-beta.N`, `latest` for `vX.Y.Z`, and a thrown error for
 * anything else: another prerelease, a tag that is not `v` and a full
 * package version (`v1.1` is a milestone tag), or any package whose version
 * is not the tag's.
 */
export function distTagFor(tag: string, versions: Readonly<Record<string, string>>): 'beta' | 'latest' {
  const match = /^v(\d+\.\d+\.\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(tag)
  if (match === null) {
    throw new Error(`${tag} is not a release tag: a package release is tagged v<major>.<minor>.<patch>, with -beta.<n> for a beta`)
  }

  const version = tag.slice(1)
  const disagreeing = Object.entries(versions).filter(([, own]) => own !== version)
  if (disagreeing.length > 0) {
    const names = disagreeing.map(([name, own]) => `${name} ${own}`).join(', ')
    throw new Error(`${tag} does not match every package: ${names}`)
  }

  const prerelease = match[2]
  if (prerelease === undefined) {
    return 'latest'
  }
  if (/^beta\.\d+$/.test(prerelease)) {
    return 'beta'
  }
  throw new Error(`${tag} is a ${prerelease} prerelease, and only a beta has a dist-tag to go to`)
}

if (import.meta.main) {
  const tag = process.argv[2] ?? ''
  try {
    const packages = releasedPackages(process.cwd())
    process.stdout.write(`${distTagFor(tag, Object.fromEntries(packages.map(({ name, version }) => [name, version])))}\n`)
  }
  catch (error) {
    process.stderr.write(`${(error as Error).message}\n`)
    process.exitCode = 1
  }
}
