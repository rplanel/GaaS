/**
 * The other projects' source agents read under `repos/` (ADR 0007): which
 * projects, which package version of each `pnpm-lock.yaml` names, where its
 * download lives and how a checkout links to it.
 *
 * Git carries none of it. `pnpm repos` (`download.mts`) downloads, and every
 * `pnpm install` (`postinstall.mjs`) links what is downloaded. Plain Node, run
 * as it is, like the release scripts.
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

export interface Project {
  /** Its directory under `repos/`. */
  readonly dir: string
  /** The npm package whose installed package version picks the source. */
  readonly package: string
  /** `owner/name` on GitHub. */
  readonly github: string
  /** The tag a package version is released under, `{packageVersion}` standing for it. */
  readonly tag: string
}

/**
 * The projects agents read the source of. `@supabase/supabase-js` is only an
 * indirect dependency, but its API is the one `nuxt-galaxy` calls.
 */
export const PROJECTS: readonly Project[] = [
  { dir: 'effect', package: 'effect', github: 'Effect-TS/effect', tag: 'effect@{packageVersion}' },
  { dir: 'drizzle-orm', package: 'drizzle-orm', github: 'drizzle-team/drizzle-orm', tag: 'v{packageVersion}' },
  { dir: 'zod', package: 'zod', github: 'colinhacks/zod', tag: 'v{packageVersion}' },
  { dir: 'nuxt-ui', package: '@nuxt/ui', github: 'nuxt/ui', tag: 'v{packageVersion}' },
  { dir: 'nuxt-supabase', package: '@nuxtjs/supabase', github: 'nuxt-modules/supabase', tag: 'v{packageVersion}' },
  { dir: 'nuxt-test-utils', package: '@nuxt/test-utils', github: 'nuxt/test-utils', tag: 'v{packageVersion}' },
  { dir: 'pinia-colada', package: '@pinia/colada', github: 'posva/pinia-colada', tag: 'v{packageVersion}' },
  { dir: 'vue-test-utils', package: '@vue/test-utils', github: 'vuejs/test-utils', tag: 'v{packageVersion}' },
  { dir: 'supabase-js', package: '@supabase/supabase-js', github: 'supabase/supabase-js', tag: 'v{packageVersion}' },
  { dir: 'd3-selection', package: 'd3-selection', github: 'd3/d3-selection', tag: 'v{packageVersion}' },
]

/**
 * The download every checkout on this machine shares, worktrees included:
 * `$XDG_CACHE_HOME/gaas/repos`, so `~/.cache/gaas/repos` by default.
 */
export function cacheDir(): string {
  return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'gaas', 'repos')
}

/** Where the source of a project at a package version is downloaded to. */
export function downloadOf(cache: string, project: Project, packageVersion: string): string {
  return join(cache, `${project.dir}@${packageVersion}`)
}

/**
 * The git refs that may hold a package version's source, in the order to try
 * them: its tag, then the commit a pre-release build such as drizzle-orm's
 * `1.0.0-rc.4-de6c356` names, since such a build has no tag.
 */
export function refsFor(project: Project, packageVersion: string): string[] {
  const tag = `refs/tags/${project.tag.replace('{packageVersion}', packageVersion)}`
  const commit = /-([0-9a-f]{7,40})$/.exec(packageVersion)?.[1]
  return commit === undefined ? [tag] : [tag, commit]
}

/** The lines of one top-level section of `pnpm-lock.yaml`, its key excluded. */
function section(lockfile: string, key: string): string[] {
  const lines = lockfile.split('\n')
  const start = lines.indexOf(`${key}:`)
  if (start === -1) {
    return []
  }
  const end = lines.findIndex((line, index) => index > start && /^\S/.test(line))
  return lines.slice(start + 1, end === -1 ? undefined : end)
}

/** A YAML key or scalar as pnpm writes it, single quotes removed. */
function unquote(value: string): string {
  return value.replace(/^'(.*)'$/, '$1')
}

/** Every package version a catalog resolves `name` to. */
function catalogPackageVersions(lockfile: string, name: string): Set<string> {
  const found = new Set<string>()
  let current: string | undefined
  for (const line of section(lockfile, 'catalogs')) {
    const key = /^ {4}(\S.*):$/.exec(line)
    if (key) {
      current = unquote(key[1]!)
      continue
    }
    const packageVersion = /^ {6}version: (.+)$/.exec(line)
    if (packageVersion && current === name) {
      found.add(unquote(packageVersion[1]!))
    }
  }
  return found
}

/** Every package version of `name` installed, whatever brought it in. */
function installedPackageVersions(lockfile: string, name: string): Set<string> {
  const found = new Set<string>()
  for (const line of section(lockfile, 'packages')) {
    const key = /^ {2}(\S.*):$/.exec(line)
    const entry = key ? unquote(key[1]!) : ''
    if (entry.startsWith(`${name}@`)) {
      found.add(entry.slice(name.length + 1))
    }
  }
  return found
}

/**
 * The package version of `name` GaaS installs, read from the text of its
 * `pnpm-lock.yaml`: the one a catalog resolves to, else the only one
 * installed. zod is installed at 3.25.76 and 4.4.3, and the catalog says
 * 4.4.3; `@supabase/supabase-js` is in no catalog and installed once.
 * Anything else is refused rather than guessed.
 */
export function packageVersionOf(lockfile: string, name: string): string {
  const format = /^lockfileVersion: '?([^'\n]*)'?$/m.exec(lockfile)?.[1]
  if (!format?.startsWith('9.')) {
    throw new Error(`pnpm-lock.yaml is lockfile format ${format}, and scripts/repos reads format 9 only`)
  }
  const fromCatalog = catalogPackageVersions(lockfile, name)
  const candidates = [...(fromCatalog.size > 0 ? fromCatalog : installedPackageVersions(lockfile, name))]
  const [packageVersion, ...others] = candidates
  if (packageVersion === undefined) {
    throw new Error(`${name} is not in pnpm-lock.yaml`)
  }
  if (others.length > 0) {
    throw new Error(`${name} is installed at ${candidates.join(', ')}, and no catalog says which one GaaS uses`)
  }
  return packageVersion
}

/** One project's link under `repos/`, as `linkRepos` left it. */
export type Link
  = | { readonly project: Project, readonly state: 'linked' | 'not downloaded' | 'in the way', readonly packageVersion: string }
    | { readonly project: Project, readonly state: 'unresolved', readonly reason: string }

/**
 * Point `repos/<dir>` of a checkout at each project's download, at the
 * package version the checkout's lockfile names. It never downloads: a
 * project not downloaded at that package version is left unlinked, and a link
 * to another package version is dropped rather than show the wrong source. A
 * real directory in the way is left alone.
 */
export function linkRepos(checkout: string, cache: string, projects: readonly Project[] = PROJECTS): Link[] {
  const lockfile = readFileSync(join(checkout, 'pnpm-lock.yaml'), 'utf8')
  return projects.map((project): Link => {
    let packageVersion: string
    try {
      packageVersion = packageVersionOf(lockfile, project.package)
    }
    catch (error) {
      return { project, state: 'unresolved', reason: (error as Error).message }
    }
    const download = downloadOf(cache, project, packageVersion)
    const link = join(checkout, 'repos', project.dir)
    const existing = lstatSync(link, { throwIfNoEntry: false })
    if (existing?.isSymbolicLink()) {
      unlinkSync(link)
    }
    else if (existing) {
      return { project, packageVersion, state: 'in the way' }
    }
    if (!existsSync(download)) {
      return { project, packageVersion, state: 'not downloaded' }
    }
    mkdirSync(join(checkout, 'repos'), { recursive: true })
    symlinkSync(download, link, 'dir')
    return { project, packageVersion, state: 'linked' }
  })
}

/** What `linkRepos` did, in a few lines for the terminal. */
export function describeLinks(links: readonly Link[]): string {
  const linked = links.filter(link => link.state === 'linked').length
  const lines = [`repos/: ${linked} of ${links.length} projects linked at the package version pnpm-lock.yaml names.`]
  const missing = links.flatMap(link => link.state === 'not downloaded' ? [`${link.project.package} ${link.packageVersion}`] : [])
  if (missing.length > 0) {
    lines.push(`Not downloaded yet: ${missing.join(', ')}. Run \`pnpm repos\` to download.`)
  }
  for (const link of links) {
    if (link.state === 'in the way') {
      lines.push(`repos/${link.project.dir} is a directory, not a link, so it was left as it is. Remove it to link the download.`)
    }
    else if (link.state === 'unresolved') {
      lines.push(`repos/${link.project.dir} was not linked: ${link.reason}`)
    }
  }
  return `${lines.join('\n')}\n`
}
