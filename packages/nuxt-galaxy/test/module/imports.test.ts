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

  it('no longer registers the database composables nothing called (#169)', () => {
    expect(names).not.toContain('useDatabaseAnalysisOutput')
    expect(names).not.toContain('useDatabaseResultDatasets')
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

  it('registers the shared naming of an input step the graph labels nodes with', () => {
    // `runtime/shared/` is imported by path inside this package and is not
    // reachable that way from the `ui` layer, so the graph gets at it only
    // through these two registrations. Unregistered, a node labels every
    // unnamed input step `undefined` — a render, not a type error (#89).
    expect(names).toContain('inputStepLabel')
    expect(names).toContain('isInputStep')
  })

  it('registers the shared token the usage statistics name the Unknown workflow by (#169)', () => {
    // From `runtime/shared/` for the same reason. `@gaas/ui` keeps no copy of
    // its own; unregistered, its usage pages would compare a selection with
    // `undefined` and the Unknown workflow could never be selected.
    expect(names).toContain('UNKNOWN_WORKFLOW_SELECTION')
  })

  it('registers the rules each parameter\'s widget reads, which any UI renders with (#166)', () => {
    // From `runtime/app/utils/`, whose every export the directory scan
    // registers. `@gaas/ui`'s widgets reach them only through these names.
    expect(names).toEqual(expect.arrayContaining([
      'repeatInstances',
      'repeatWithChild',
      'parameterGroupValue',
      'parameterGroupWithChild',
      'conditionalCaseInputs',
      'selectOptions',
      'selectOptionLabels',
      'isBooleanParameterTrue',
      'booleanParameterSpelling',
    ]))
  })

  it('registers the results-view lookup and the match it runs, which the UI layer\'s pages read (#168)', () => {
    // The results page calls the first and the admin workflows page the
    // second, each without an import; unregistered, either is an empty render.
    expect(names).toContain('useResultsView')
    expect(names).toContain('matchResultsView')
  })

  it('no longer registers the select rules that read values alone (#183)', () => {
    expect(names).not.toContain('selectOptionValues')
    expect(names).not.toContain('selectOptionLabel')
  })
})
