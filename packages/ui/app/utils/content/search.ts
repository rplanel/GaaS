/**
 * Parses the raw `dois` strings `searchContentRef` finds in `::ref` blocks.
 * Each string is one attribute value, which may itself hold several
 * comma-separated DOIs. Returns trimmed DOIs, without duplicates or empties.
 */
export function parseDois(dois: string[]): string[] {
  const uniqueDois = new Set<string>()
  for (const doi of dois) {
    for (const part of doi.split(',')) {
      const trimmed = part.trim()
      if (trimmed) {
        uniqueDois.add(trimmed)
      }
    }
  }
  return [...uniqueDois]
}

export function searchContentRef(content: unknown) {
  let dois: string[] = []

  if (!Array.isArray(content) || content.length <= 1) {
    return dois
  }

  const type = content[0]
  if (!type) {
    return dois
  }

  if (content.length === 2 && type === 'ref') {
    const attributes = content[1] as { dois: string }
    return [...dois, attributes.dois]
  }

  if (content.length >= 3 && type === 'ref') {
    const attributes = content[1] as { dois: string }
    dois.push(attributes.dois)
  }

  const children = content.slice(2)
  for (const block of children) {
    dois = [...dois, ...searchContentRef(block)]
  }
  return dois
}
