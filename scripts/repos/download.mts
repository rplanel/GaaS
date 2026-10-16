/**
 * `pnpm repos`: download, for each project agents read, the source of the
 * package version `pnpm-lock.yaml` names, then link `repos/` to it (ADR 0007).
 *
 * A download is GitHub's archive of the ref, so it holds no `.git` that
 * CodeGraph could take for a repository of the workspace. It is kept per
 * package version in a cache every checkout on the machine shares, and never
 * fetched twice: a second worktree only links it.
 */

import type { Project } from './repos.mts'
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { cacheDir, describeLinks, downloadOf, linkRepos, packageVersionOf, PROJECTS, refsFor } from './repos.mts'

/**
 * Download one project's source into the cache, from the first of its refs
 * GitHub has, and say where it came from. It is extracted beside the cache
 * entry and renamed into place, so a download cut short never looks complete,
 * and of two checkouts downloading at once the first to finish wins.
 */
async function download(cache: string, project: Project, packageVersion: string): Promise<string> {
  const target = downloadOf(cache, project, packageVersion)
  if (existsSync(target)) {
    return 'already downloaded'
  }
  const refs = refsFor(project, packageVersion)
  for (const ref of refs) {
    const response = await fetch(`https://codeload.github.com/${project.github}/tar.gz/${ref}`)
    if (response.status === 404) {
      continue
    }
    if (!response.ok || response.body === null) {
      throw new Error(`GitHub answered ${response.status} for ${project.github} ${ref}`)
    }
    const scratch = mkdtempSync(join(cache, `.${project.dir}@${packageVersion}-`))
    try {
      const archive = join(scratch, 'source.tar.gz')
      await pipeline(Readable.fromWeb(response.body), createWriteStream(archive))
      const source = join(scratch, 'source')
      mkdirSync(source)
      execFileSync('tar', ['-xzf', archive, '-C', source, '--strip-components=1'])
      renameSync(source, target)
    }
    catch (error) {
      if (!existsSync(target)) {
        throw error
      }
    }
    finally {
      rmSync(scratch, { recursive: true, force: true })
    }
    return `downloaded from ${project.github} ${ref}`
  }
  throw new Error(`${project.github} has none of ${refs.join(', ')}`)
}

const checkout = process.cwd()
const cache = cacheDir()
const lockfile = readFileSync(join(checkout, 'pnpm-lock.yaml'), 'utf8')
mkdirSync(cache, { recursive: true })

const results = await Promise.allSettled(PROJECTS.map(async (project) => {
  const packageVersion = packageVersionOf(lockfile, project.package)
  process.stdout.write(`${project.package} ${packageVersion}: ${await download(cache, project, packageVersion)}\n`)
}))
results.forEach((result, index) => {
  if (result.status === 'rejected') {
    process.stderr.write(`${PROJECTS[index]?.package} was not downloaded: ${(result.reason as Error).message}\n`)
    process.exitCode = 1
  }
})
process.stdout.write(describeLinks(linkRepos(checkout, cache)))
