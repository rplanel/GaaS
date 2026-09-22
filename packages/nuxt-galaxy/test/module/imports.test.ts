import type { NuxtHooks } from '@nuxt/schema'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'
import { beforeAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(__dirname, '../fixtures/basic')

type ImportsContext = Parameters<NuxtHooks['imports:context']>[0]

/**
 * The names the module makes available without an import, read back from
 * Nuxt's own import registry once every module has registered its share.
 */
async function loadAutoImportNames(): Promise<string[]> {
  const nuxt = await loadNuxt({
    cwd: fixtureDir,
    dev: false,
    ready: false,
    overrides: { ssr: false, test: true },
  })
  let context: ImportsContext | undefined
  nuxt.hook('imports:context', (ctx) => {
    context = ctx
  })
  await nuxt.ready()
  const imports = await context!.getImports()
  await nuxt.close()
  return imports.map(entry => entry.as ?? entry.name)
}

describe('module auto-imports', () => {
  let names: string[]

  beforeAll(async () => {
    names = await loadAutoImportNames()
  })

  it('registers the database composables the UI still calls', () => {
    expect(names).toContain('useDatabaseAnalysisOutput')
    expect(names).toContain('useDatabaseResultDatasets')
  })

  it('no longer registers the first-generation workflow composable', () => {
    expect(names).not.toContain('useDatabaseWorkflow')
  })
})
