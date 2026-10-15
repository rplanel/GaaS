/**
 * Wait for the mirror to publish the release just pushed, and fail with it
 * (ADR 0006).
 *
 * The last step of `pnpm release` and `pnpm release:beta`. It finds the
 * publish run the release tag started on the GitHub mirror, prints its link,
 * and watches it to the end, so the command that cut the release also says
 * whether the release reached npm. Run it alone (`pnpm release:await`) to
 * pick the watch up again.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

/** The GitHub mirror, as GitHub spells it: npm compares the name case-sensitively. */
export const MIRROR = 'rplanel/GaaS'

export interface WorkflowRun {
  readonly databaseId: number
  readonly headSha: string
  readonly event: string
  readonly url: string
}

/**
 * The run a push of the tagged commit started, newest first as `gh run list`
 * answers, or `undefined` while GitHub has not started one.
 */
export function runFor(runs: readonly WorkflowRun[], sha: string): WorkflowRun | undefined {
  return runs.find(run => run.event === 'push' && run.headSha === sha)
}

/** Five seconds apart, for three minutes: GitHub usually starts the run within seconds. */
const ATTEMPTS = 36
const INTERVAL_MS = 5_000

if (import.meta.main) {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
  const tag = `v${version}`
  const sha = execFileSync('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' }).trim()

  let run: WorkflowRun | undefined
  for (let attempt = 1; attempt <= ATTEMPTS && run === undefined; attempt++) {
    const listed = execFileSync('gh', ['run', 'list', '--repo', MIRROR, '--workflow', 'publish.yml', '--event', 'push', '--limit', '20', '--json', 'databaseId,headSha,event,url'], { encoding: 'utf8' })
    run = runFor(JSON.parse(listed) as WorkflowRun[], sha)
    if (run === undefined && attempt < ATTEMPTS) {
      await sleep(INTERVAL_MS)
    }
  }

  if (run === undefined) {
    process.stderr.write(
      `No publish run for ${tag} has started on ${MIRROR}. Check that the tag reached GitHub `
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
