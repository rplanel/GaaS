import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** One `app/workflows/<name>/<version>/results.vue` found on disk. */
export interface ScannedResultsView {
  /** The `<name>` directory, verbatim: the workflow's `name:` tag value. */
  name: string
  /** The `<version>` directory, verbatim: the workflow's `version:` tag value. */
  version: string
  /** Absolute path of the component file. */
  file: string
}

/**
 * Finds every results view in the given layer application directories.
 *
 * `appDirs` are the layers' `app/` directories in the order Nuxt lists its
 * layers: the application first, then what it extends. When two layers define
 * the same name and version, the first one given wins, as it does for every
 * other Nuxt convention.
 */
export async function scanResultsViews(appDirs: string[]): Promise<ScannedResultsView[]> {
  const views: ScannedResultsView[] = []
  const seen = new Set<string>()

  for (const appDir of appDirs) {
    const workflowsDir = join(appDir, 'workflows')
    for (const name of await subdirectories(workflowsDir)) {
      for (const version of await subdirectories(join(workflowsDir, name))) {
        const file = join(workflowsDir, name, version, 'results.vue')
        if (!await isFile(file))
          continue
        const key = `${name}/${version}`
        if (seen.has(key))
          continue
        seen.add(key)
        views.push({ name, version, file: toPosixPath(file) })
      }
    }
  }

  return views
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
