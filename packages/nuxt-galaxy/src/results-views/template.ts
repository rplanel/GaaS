import type { ScannedResultsView } from './scan'

/** Where the generated registry is imported from, in the page and in its type declaration. */
export const RESULTS_VIEWS_MODULE_ID = '#build/gaas/results-views.mjs'

/**
 * The registry the page imports: one entry per view, keyed by its rung and
 * the directory names verbatim, each holding a lazily loaded component. The
 * dynamic import is what code-splits a view away from the page.
 */
export function renderResultsViewsRegistry(views: ScannedResultsView[]): string {
  const entries = views.map(view => [
    '  {',
    `    rung: ${JSON.stringify(view.rung)},`,
    ...('name' in view ? [`    name: ${JSON.stringify(view.name)},`] : []),
    ...('version' in view ? [`    version: ${JSON.stringify(view.version)},`] : []),
    `    component: defineAsyncComponent(() => import(${JSON.stringify(view.file)})),`,
    '  },',
  ].join('\n'))

  return [
    `import { defineAsyncComponent } from 'vue'`,
    '',
    'export const resultsViews = [',
    ...entries,
    ']',
    '',
  ].join('\n')
}

/**
 * The declaration that types the registry module for the page and for `vue-tsc`.
 *
 * It spells the entry shapes out rather than importing them from the scanner,
 * so the page's type never depends on a build-time file; the match policy's
 * own constraint checks that the two agree.
 */
export function renderResultsViewsTypes(): string {
  return [
    `declare module '${RESULTS_VIEWS_MODULE_ID}' {`,
    `  import type { Component } from 'vue'`,
    '',
    '  /** A results view the build found, scoped by its directory names verbatim (ADR 0003). */',
    '  export type ResultsViewEntry =',
    '    | {',
    '      /** `app/workflows/<name>/<version>/results.vue`: one workflow. */',
    `      rung: 'exact'`,
    '      /** The workflow\'s `name:` tag value, exactly as the directory is named. */',
    '      name: string',
    '      /** The workflow\'s `version:` tag value, exactly as the directory is named. */',
    '      version: string',
    '      /** The view, loaded on first render. */',
    '      component: Component',
    '    }',
    '    | {',
    '      /** `app/workflows/<name>/results.vue`: every version of one workflow name. */',
    `      rung: 'name-level'`,
    '      name: string',
    '      component: Component',
    '    }',
    '    | {',
    '      /** `app/workflows/results.vue`: every workflow of the application. */',
    `      rung: 'app-wide'`,
    '      component: Component',
    '    }',
    '',
    '  export const resultsViews: readonly ResultsViewEntry[]',
    '}',
    '',
  ].join('\n')
}
