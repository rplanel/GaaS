import type { BibliographyCollectionItem } from '@nuxt/content'

interface Citation {
  label: string
  href: string
}

export function useCitations(articles: MaybeRef<BibliographyCollectionItem[] | undefined>) {
  const citations = computed(() => {
    const articlesVal = toValue(articles)
    if (!articlesVal) {
      return
    }
    return articlesVal.map((article) => {
      const firstAuthors = article.author[0]
      const citation: Citation = {
        label: '',
        href: `https://doi.org/${article.DOI}`,
      }
      if (!firstAuthors) {
        citation.label = 'Unknown'
      }
      else {
        const { family } = firstAuthors
        citation.label = `${family} et al`
      }
      const { 'date-parts': dateParts } = article.issued
      const year = dateParts?.[0]?.[0]
      return {
        ...citation,
        label: year !== undefined ? `${citation.label} - ${year}` : citation.label,

      }
    })
  })

  return {
    citations,
  }
}
