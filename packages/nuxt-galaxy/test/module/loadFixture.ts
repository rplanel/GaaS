import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(__dirname, '../fixtures/basic')

type Nuxt = Awaited<ReturnType<typeof loadNuxt>>

export interface FixtureOptions {
  /** Module options to put under `galaxy` in the fixture's config. */
  readonly galaxy?: Record<string, unknown>
  /** Modules the app lists itself, ahead of this one. */
  readonly modules?: readonly string[]
  /** Register hooks here; it runs before `ready()`, which is the only moment some fire. */
  readonly before?: (nuxt: Nuxt) => void
}

/**
 * Load the fixture with the module applied, read something off the resolved
 * config, and close it again.
 *
 * Every load used to get its own `@nuxt/content` database, because content
 * was a module dependency of this one and two test files loading the fixture
 * at once raced on one SQLite file (#87). Content is no longer installed
 * (#162, checked in `dependencies.test.ts`), so there is no database to share
 * and nothing to give each load.
 */
export async function withFixtureNuxt<T>(
  read: (options: Nuxt['options']) => T | Promise<T>,
  { galaxy = {}, modules = [], before }: FixtureOptions = {},
): Promise<T> {
  const nuxt = await loadNuxt({
    cwd: fixtureDir,
    dev: false,
    ready: false,
    overrides: {
      ssr: false,
      test: true,
      galaxy,
      // Concatenated ahead of the fixture's own list, not in place of it.
      modules: [...modules],
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
  }
}
