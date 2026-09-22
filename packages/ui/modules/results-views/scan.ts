// A type-only import: the rung vocabulary lives with the match policy the page
// runs, and the build-time scanner reads it from there rather than restating it.
import type { ResultsViewScope } from '../../app/utils/resultsViews'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** One `results.vue` found on disk: its scope, read off its directories verbatim, and where it is. */
export type ScannedResultsView = ResultsViewScope & {
  /** Absolute path of the component file. */
  file: string
}

/** A view a later layer defines that an earlier layer's view of the same scope hides. */
export interface ShadowedResultsView {
  /** Absolute path of the file that is not used. */
  file: string
  /** Absolute path of the file that applies in its place. */
  shadowedBy: string
}

export interface ResultsViewsScan {
  /** The views that apply, one per scope. */
  views: ScannedResultsView[]
  /** The files that lost to an earlier layer, in the order they were met. */
  shadowed: ShadowedResultsView[]
}

/**
 * Finds every results view in the given layer application directories (ADR 0003).
 *
 * Each layer is scanned for the three rungs: `app/workflows/<name>/<version>/results.vue`
 * (exact), `app/workflows/<name>/results.vue` (name-level) and `app/workflows/results.vue`
 * (app-wide). `appDirs` are the layers' `app/` directories in the order Nuxt
 * lists its layers: the application first, then what it extends. When two
 * layers define a view of the same scope, the first one given wins, as it
 * does for every other Nuxt convention, and the loser is reported as shadowed.
 */
export async function scanResultsViews(appDirs: string[]): Promise<ResultsViewsScan> {
  const views: ScannedResultsView[] = []
  const shadowed: ShadowedResultsView[] = []
  const winners = new Map<string, string>()

  const record = (scopeKey: string, view: ScannedResultsView) => {
    const winner = winners.get(scopeKey)
    if (winner) {
      shadowed.push({ file: view.file, shadowedBy: winner })
      return
    }
    winners.set(scopeKey, view.file)
    views.push(view)
  }

  for (const appDir of appDirs) {
    const workflowsDir = join(appDir, 'workflows')

    const appWide = join(workflowsDir, 'results.vue')
    if (await isFile(appWide))
      record('app-wide', { rung: 'app-wide', file: toPosixPath(appWide) })

    for (const name of await subdirectories(workflowsDir)) {
      const nameLevel = join(workflowsDir, name, 'results.vue')
      if (await isFile(nameLevel))
        record(`name-level:${name}`, { rung: 'name-level', name, file: toPosixPath(nameLevel) })

      for (const version of await subdirectories(join(workflowsDir, name))) {
        const exact = join(workflowsDir, name, version, 'results.vue')
        if (await isFile(exact))
          record(`exact:${name}/${version}`, { rung: 'exact', name, version, file: toPosixPath(exact) })
      }
    }
  }

  return { views, shadowed }
}

/** The path with forward slashes, as Nuxt and Vite spell paths on every platform. */
export function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/')
}

/** The names of the directories directly under `dir`, sorted; none when `dir` is absent. */
async function subdirectories(dir: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  }
  catch {
    return []
  }
  const directories: string[] = []
  for (const entry of entries.sort()) {
    if (await isDirectory(join(dir, entry)))
      directories.push(entry)
  }
  return directories
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(stats => stats.isDirectory(), () => false)
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(stats => stats.isFile(), () => false)
}
