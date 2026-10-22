import type { ScannedResultsView, ShadowedResultsView } from './scan'

/**
 * Reports each shadowed results view once, however many times the scan is
 * repeated. In development the scan reruns on every change under a
 * `workflows/` directory, and the same shadowed file would otherwise be
 * announced each time.
 */
export function createShadowedReporter(report: (message: string) => void): (shadowed: readonly ShadowedResultsView[]) => void {
  const reported = new Set<string>()
  return (shadowed) => {
    for (const entry of shadowed) {
      if (reported.has(entry.file))
        continue
      reported.add(entry.file)
      report(`Results view ${entry.file} is shadowed by ${entry.shadowedBy}`)
    }
  }
}

/** The views as one line for the log: `<name>/<version>` for an exact view, `*` for what a fallback covers. */
export function describeResultsViews(views: readonly ScannedResultsView[]): string {
  if (views.length === 0)
    return 'none'
  return views.map(describeScope).join(', ')
}

function describeScope(view: ScannedResultsView): string {
  if (view.rung === 'exact')
    return `${view.name}/${view.version}`
  if (view.rung === 'name-level')
    return `${view.name}/*`
  return '*/*'
}
