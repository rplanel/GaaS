/**
 * Converts a workflow slug (kebab-case) into a Vue-compatible PascalCase component name.
 * Example: "satellite-finder-2" -> "SatelliteFinder2"
 */
export function toWorkflowComponentName(workflowSlug: string): string {
  return workflowSlug
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}
