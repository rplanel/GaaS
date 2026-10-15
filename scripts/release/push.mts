/**
 * Push a package release: GitLab first, then the GitHub mirror (ADR 0006).
 *
 * `pnpm release:push` runs this after the bump. The order is load-bearing:
 * the mirror publishes whatever release tag it receives, so it must never
 * hold one GitLab refused. Each push is atomic and names the release tag
 * alone:
 * - **Atomic:** with `--follow-tags`, a refused `main` still landed the tag.
 * - **The release tag alone:** GitHub starts no run for a push of more than
 *   three tags, and an older `v` tag would start a publish run of its own.
 *
 * Safe to run again: a push the remote already has changes nothing.
 */

import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { MIRROR, releasedPackages, tagOf } from './release.mts'

/** The `git` arguments of each push, in the order they must run. */
export function pushes(tag: string): string[][] {
  return ['origin', `git@github.com:${MIRROR}.git`].map(remote => ['push', '--atomic', remote, 'main', `refs/tags/${tag}`])
}

if (import.meta.main) {
  const root = releasedPackages(process.cwd()).find(pkg => pkg.private)
  const tag = tagOf(root?.version ?? '')
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { stdio: 'ignore' })
    for (const args of pushes(tag)) {
      execFileSync('git', args, { stdio: 'inherit' })
    }
  }
  catch {
    process.stderr.write(`Pushing ${tag} stopped. Nothing went to the mirror after a push that failed. Fix the cause, then run pnpm release:push again.\n`)
    process.exitCode = 1
  }
}
