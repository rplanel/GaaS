/**
 * Normalizes a workflow name into a URL-safe slug.
 * Lowercases, replaces non-alphanumeric with hyphens, trims,
 * and ensures the result starts with a letter (prefixes 'w-' if needed).
 */
function slugifyWorkflowName(name: string): string {
  let slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')

  if (!slug) {
    throw new Error(`Workflow name "${name}" contains no alphanumeric characters`)
  }

  if (/^\d/.test(slug)) {
    slug = `w-${slug}`
  }

  return slug
}

/**
 * Generates a unique slug for a workflow from its name and version.
 * Result is kebab-case, starts with a letter, and safe for use as a Vue component name base.
 * Examples: "satellite-finder-2", "my-tool-1", "w-123-workflow-1"
 */
export function generateWorkflowSlug(name: string, version: string): string {
  const slug = slugifyWorkflowName(name)

  // Sanitize version: replace characters not valid in HTML tag names with '-'
  const sanitizedVersion = String(version)
    .replace(/[^a-z0-9.-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/-+$/, '')

  if (!sanitizedVersion) {
    throw new Error(`Cannot generate workflow_slug: version "${version}" contains no valid characters`)
  }

  // Ensure workflow_slug fits in 255 chars (DB column limit)
  const maxSlugLength = 255 - sanitizedVersion.length - 1 // -1 for the '-' separator
  let truncatedSlug = slug
  if (slug.length > maxSlugLength) {
    truncatedSlug = slug.substring(0, maxSlugLength).replace(/-+$/, '')
  }
  if (!truncatedSlug) {
    throw new Error(`Cannot generate workflow_slug: workflow name "${name}" too long`)
  }

  return `${truncatedSlug}-${sanitizedVersion}`
}

export { toWorkflowComponentName } from '../../../app/utils/workflowSlug'
