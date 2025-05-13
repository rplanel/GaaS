export function searchContentRef(content: unknown) {
  let dois: string[] = []

  // console.log('dans searchContentRef in utils===============')
  // const parsedContent = content.value
  // console.log('parsedContent', content)
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
