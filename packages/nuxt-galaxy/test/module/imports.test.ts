import type { NuxtHooks } from '@nuxt/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { withFixtureNuxt } from './loadFixture'

type ImportsContext = Parameters<NuxtHooks['imports:context']>[0]

/**
 * The names the module makes available without an import, read back from
 * Nuxt's own import registry once every module has registered its share.
 *
 * `imports:context` fires during `ready()`, so the hook is registered from
 * `before` rather than after the load — see `loadFixture`.
 */
async function loadAutoImportNames(): Promise<string[]> {
  let context: ImportsContext | undefined
  return withFixtureNuxt(
    async () => {
      const imports = await context!.getImports()
      return imports.map(entry => entry.as ?? entry.name)
    },
    {
      before: nuxt => nuxt.hook('imports:context', (ctx) => {
        context = ctx
      }),
    },
  )
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

  it('registers the sentences the invoke form marks a step with', () => {
    // Both are called from `InvokeForm.vue`'s template, where an unregistered
    // name is not a type error but an empty render: the step would be marked
    // with a blank description and nothing would say why. The composable's own
    // registration is what the pair of them hang off.
    expect(names).toContain('useGalaxyWorkflowDescription')
    expect(names).toContain('describeUnavailableTool')
    expect(names).toContain('describeUnconnectedDatasetInputs')
  })
})
