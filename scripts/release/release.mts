/**
 * What a package release is made of, for the release scripts (ADR 0006): the
 * packages it bumps, the tag it is cut as, and the mirror that publishes it.
 *
 * The scripts under `scripts/release/` are plain Node, run as they are:
 * Node 22.18 or later strips their types and has `import.meta.main`. The
 * publish workflow runs Node 24.
 */

import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/** The GitHub mirror, as GitHub spells it: npm compares the name case-sensitively. */
export const MIRROR = 'rplanel/GaaS'

export interface ReleasedPackage {
  readonly name: string
  readonly version: string
  readonly private: boolean
}

/** A file `.versionrc.json` has a release bump: its path, or the path and the updater that bumps it. */
export type BumpFile = string | { readonly filename: string, readonly updater?: string }

/**
 * Every package a release bumps, as `.versionrc.json` lists them: the
 * private root, which carries the package version too, and the three
 * packages published to npm. The other files it bumps, such as
 * `codemeta.json`, are not packages.
 */
export function releasedPackages(root: string): ReleasedPackage[] {
  const { bumpFiles } = JSON.parse(readFileSync(join(root, '.versionrc.json'), 'utf8')) as { bumpFiles: BumpFile[] }
  return bumpFiles
    .map(file => typeof file === 'string' ? file : file.filename)
    .filter(file => basename(file) === 'package.json')
    .map((file) => {
      const manifest = JSON.parse(readFileSync(join(root, file), 'utf8')) as { name: string, version: string, private?: boolean }
      return { name: manifest.name, version: manifest.version, private: manifest.private === true }
    })
}

/** The tag a package version is cut as, as commit-and-tag-version writes it. */
export function tagOf(version: string): string {
  return `v${version}`
}
