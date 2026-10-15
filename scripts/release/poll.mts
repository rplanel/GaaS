import { setTimeout as sleep } from 'node:timers/promises'

/**
 * Ask `attempt` up to `times` times, `intervalMs` apart, until it answers
 * something other than `undefined`.
 *
 * A throw counts as no answer yet, because what is asked here is a remote
 * that catches up in its own time: `gh run list` does not know the workflow
 * the same push brought, and npm's registry answers from a cache. The last
 * error is handed back, so a caller that gives up can say why.
 */
export async function poll<T>(
  times: number,
  intervalMs: number,
  attempt: () => T | undefined | Promise<T | undefined>,
): Promise<{ value?: T, lastError?: unknown }> {
  let lastError: unknown
  for (let asked = 1; asked <= times; asked++) {
    try {
      const value = await attempt()
      if (value !== undefined) {
        return { value }
      }
    }
    catch (error) {
      lastError = error
    }
    if (asked < times) {
      await sleep(intervalMs)
    }
  }
  return { lastError }
}
