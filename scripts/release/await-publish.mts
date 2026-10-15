/**
 * Wait for the mirror to publish the package release just pushed, and fail
 * with it (ADR 0006).
 *
 * The last step of `pnpm release` and `pnpm release:beta`. It finds the
 * publish run the release tag started on the GitHub mirror, prints its link,
 * and watches it to the end, so the command that cut the package release
 * also says whether it reached npm. Run it alone (`pnpm release:await`) to
 * pick the watch up again.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import process from 'node:process'
import { poll } from './poll.mts'
import { MIRROR, releasedPackages, tagOf } from './release.mts'

/** One run of a GitHub Actions workflow, as `gh run list --json` describes it. */
export interface ActionsRun {
  readonly databaseId: number
  readonly headSha: string
  readonly event: string
  readonly url: string
}

/**
 * The run a push of `sha` started, newest first as `gh run list` answers,
 * or `undefined` while GitHub has not started one.
 */
export function runForCommit(runs: readonly ActionsRun[], sha: string): ActionsRun | undefined {
  return runs.find(run => run.event === 'push' && run.headSha === sha)
}

if (import.meta.main) {
  const root = releasedPackages(process.cwd()).find(pkg => pkg.private)
  const tag = tagOf(root?.version ?? '')
  const sha = execFileSync('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' }).trim()

  // Five seconds apart, for three minutes: GitHub usually starts the run
  // within seconds. Until it has read the publish workflow the same push
  // brought, `gh run list` answers that no such workflow exists.
  const { value: run, lastError } = await poll(36, 5_000, () => {
    const listed = execFileSync('gh', ['run', 'list', '--repo', MIRROR, '--workflow', 'publish.yml', '--event', 'push', '--limit', '20', '--json', 'databaseId,headSha,event,url'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return runForCommit(JSON.parse(listed) as ActionsRun[], sha)
  })

  if (run === undefined) {
    const why = lastError === undefined ? '' : ` The last attempt to list runs failed: ${(lastError as Error).message.trim()}`
    process.stderr.write(
      `No publish run for ${tag} has started on ${MIRROR}.${why} Check that the tag reached GitHub `
      + `(git ls-remote https://github.com/${MIRROR}.git ${tag}), then run pnpm release:await again.\n`,
    )
    process.exitCode = 1
  }
  else {
    process.stdout.write(`Publishing ${tag}: ${run.url}\n`)
    const watched = spawnSync('gh', ['run', 'watch', String(run.databaseId), '--repo', MIRROR, '--exit-status'], { stdio: 'inherit' })
    process.exitCode = watched.status ?? 1
  }
}
