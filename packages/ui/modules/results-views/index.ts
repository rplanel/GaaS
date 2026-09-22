import { resolve } from 'node:path'
// The `nuxt/kit` subpath binds the kit to the Nuxt that loads this layer, so the package declares no kit of its own.
import { addTemplate, addTypeTemplate, defineNuxtModule, getLayerDirectories, logger, updateTemplates } from 'nuxt/kit'
import { createShadowedReporter, describeResultsViews } from './report'
import { scanResultsViews, toPosixPath } from './scan'
import { renderResultsViewsRegistry, renderResultsViewsTypes, RESULTS_VIEWS_MODULE_ID } from './template'

const log = logger.withTag('@gaas/ui')

/** The registry template's name inside the build directory, which `#build/` prefixes for the page. */
const REGISTRY_FILENAME = RESULTS_VIEWS_MODULE_ID.replace(/^#build\//, '')
/** Named after the registry so Nuxt skips its untyped `declare module` shorthand for it. */
const REGISTRY_TYPES_FILENAME = `${REGISTRY_FILENAME.replace(/\.mjs$/, '')}.d.ts` as const

/**
 * Finds results views by directory (ADR 0003).
 *
 * Every layer is scanned for `app/workflows/<name>/<version>/results.vue`,
 * where the two directories are the workflow's `name:` and `version:` tag
 * values written exactly as tagged, and for the two fallbacks below it:
 * `app/workflows/<name>/results.vue` for every version of a name, and
 * `app/workflows/results.vue` for every workflow of the application. The
 * views are written into a generated registry the results page imports, each
 * carrying its rung and its directory names verbatim, and each loaded on
 * first render. When the application and a layer both define a view of the
 * same scope, the application's is used, and development mode says once which
 * file was shadowed. In development the registry follows the file system, so
 * a view created or removed while the server runs shows up on the next
 * navigation.
 */
export default defineNuxtModule({
  meta: {
    name: '@gaas/ui/results-views',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  async setup(_options, nuxt) {
    const appDirs = getLayerDirectories(nuxt).map(dirs => dirs.app)
    let scan = await scanResultsViews(appDirs)

    addTemplate({
      filename: REGISTRY_FILENAME,
      getContents: () => renderResultsViewsRegistry(scan.views),
    })
    addTypeTemplate({
      filename: REGISTRY_TYPES_FILENAME,
      getContents: () => renderResultsViewsTypes(),
    })

    if (!nuxt.options.dev)
      return

    const reportShadowed = createShadowedReporter(message => log.info(message))
    log.info(`Results views: ${describeResultsViews(scan.views)}`)
    reportShadowed(scan.shadowed)

    // Creating or deleting a directory fires several events for one change; a
    // rescan is cheap, regenerating the registry and reloading the page is not.
    const workflowsDirs = appDirs.map(dir => toPosixPath(resolve(dir, 'workflows')))
    nuxt.hook('builder:watch', async (event, path) => {
      // Editing a view changes no directory name, so only added or removed entries matter.
      if (event === 'change')
        return
      const changed = toPosixPath(resolve(nuxt.options.srcDir, path))
      if (!workflowsDirs.some(dir => changed === dir || changed.startsWith(`${dir}/`)))
        return
      const rescanned = await scanResultsViews(appDirs)
      const viewsChanged = JSON.stringify(rescanned.views) !== JSON.stringify(scan.views)
      scan = rescanned
      reportShadowed(scan.shadowed)
      if (!viewsChanged)
        return
      await updateTemplates({ filter: template => template.filename === REGISTRY_FILENAME })
      log.info(`Results views: ${describeResultsViews(scan.views)}`)
    })
  },
})
