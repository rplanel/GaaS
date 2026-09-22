import type { ScannedResultsView } from './scan'
import { resolve } from 'node:path'
import { addTemplate, addTypeTemplate, defineNuxtModule, getLayerDirectories, logger, updateTemplates } from '@nuxt/kit'
import { scanResultsViews } from './scan'
import { renderResultsViewsRegistry, renderResultsViewsTypes } from './template'

const log = logger.withTag('@gaas/ui')

/** The template's name inside the build directory; `#build/` + this is what the page imports. */
const REGISTRY_FILENAME = 'gaas/results-views.mjs'
/** Named after the registry so Nuxt skips its untyped `declare module` shorthand for it. */
const REGISTRY_TYPES_FILENAME = 'gaas/results-views.d.ts'

/**
 * Finds results views by directory (ADR 0003).
 *
 * Every layer is scanned for `app/workflows/<name>/<version>/results.vue`,
 * where the two directories are the workflow's `name:` and `version:` tag
 * values written exactly as tagged. The views are written into a generated
 * registry the results page imports, keyed by those names verbatim and each
 * loaded on first render. In development the registry follows the file system,
 * so a view directory created or removed while the server runs shows up on the
 * next navigation.
 */
export default defineNuxtModule({
  meta: {
    name: '@gaas/ui/results-views',
  },
  async setup(_options, nuxt) {
    const appDirs = getLayerDirectories(nuxt).map(dirs => dirs.app)
    let views = await scanResultsViews(appDirs)

    addTemplate({
      filename: REGISTRY_FILENAME,
      getContents: () => renderResultsViewsRegistry(views),
    })
    addTypeTemplate({
      filename: REGISTRY_TYPES_FILENAME,
      getContents: () => renderResultsViewsTypes(),
    })

    if (!nuxt.options.dev)
      return

    log.info(`Results views: ${describeViews(views)}`)

    // Creating or deleting a directory fires several events for one change; a
    // rescan is cheap, regenerating the registry and reloading the page is not.
    const workflowsDirs = appDirs.map(dir => resolve(dir, 'workflows'))
    nuxt.hook('builder:watch', async (_event, path) => {
      const changed = resolve(nuxt.options.srcDir, path)
      if (!workflowsDirs.some(dir => changed === dir || changed.startsWith(`${dir}/`)))
        return
      const rescanned = await scanResultsViews(appDirs)
      if (JSON.stringify(rescanned) === JSON.stringify(views))
        return
      views = rescanned
      await updateTemplates({ filter: template => template.filename === REGISTRY_FILENAME })
      log.info(`Results views: ${describeViews(views)}`)
    })
  },
})

function describeViews(views: ScannedResultsView[]): string {
  if (views.length === 0)
    return 'none'
  return views.map(view => `${view.name}/${view.version}`).join(', ')
}
