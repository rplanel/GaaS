import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(__dirname, '../fixtures/basic')

type Nuxt = Awaited<ReturnType<typeof loadNuxt>>

export interface FixtureOptions {
  /** Module options to put under `galaxy` in the fixture's config. */
  readonly galaxy?: Record<string, unknown>
  /** Register hooks here; it runs before `ready()`, which is the only moment some fire. */
  readonly before?: (nuxt: Nuxt) => void
}

/**
 * Load the fixture with the module applied, read something off the resolved
 * config, and close it again.
 *
 * Every load gets its **own** content database, and that is not tidiness.
 * `@nuxt/content` is a module dependency of this one, so it builds on every
 * load; its `_localDatabase` is keyed by the database's location, and the
 * fixture's default is one file shared by every load in the project. Vitest
 * runs test *files* in parallel, so two files loading the fixture at once
 * ran two content builds against one SQLite file, and each called
 * `dropContentTables()` on tables the other had already dropped.
 *
 * That surfaces as `SqliteError: no such table: _content_info` — and as an
 * **unhandled rejection** rather than a failed test, because content calls
 * `db.dropContentTables()` without awaiting it (`@nuxt/content@3.15.1`,
 * `module.mjs:3278`). Vitest fails the run for it with every test passing,
 * which is how it reached `main` after passing on two merge request
 * pipelines (#87).
 *
 * A unique database per load makes two builds touch nothing in common,
 * which is the only fix available on this side of the module boundary. The
 * file is removed again on the way out.
 */
export async function withFixtureNuxt<T>(
  read: (options: Nuxt['options']) => T | Promise<T>,
  { galaxy = {}, before }: FixtureOptions = {},
): Promise<T> {
  // A random name, not a counter: vitest's `threads` pool runs its workers
  // in one process, so a per-process counter collides across them and puts
  // two builds back on one file — the very thing this avoids.
  const database = `.data/content/test-${randomUUID()}.sqlite`
  const nuxt = await loadNuxt({
    cwd: fixtureDir,
    dev: false,
    ready: false,
    overrides: {
      ssr: false,
      test: true,
      galaxy,
      // `_localDatabase`, not `database`: the latter is the production
      // connection, while this is the one content builds into and the one
      // `dropContentTables()` runs against.
      content: {
        _localDatabase: {
          type: 'sqlite',
          filename: database,
        },
      },
    },
  })
  try {
    before?.(nuxt)
    await nuxt.ready()
    // Read before closing: `close()` is what tears the resolved config down.
    return await read(nuxt.options)
  }
  finally {
    await nuxt.close()
    // Nothing reads it again, and a suite that left one behind per load
    // would grow `.data` without bound.
    await rm(join(fixtureDir, database), { force: true })
  }
}
