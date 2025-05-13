import type { BibliographyCollectionItem } from '@nuxt/content'

interface BibliographyItem {
  title: string
  authors: string[]
  year: number
  doi: string
  journal: string
  abstract: string
}

export function useBibliography(
  articles: MaybeRef<BibliographyCollectionItem[] | undefined>,
) {
  const bibliography = computed(() => {
    const articlesVal = toValue(articles)
    if (!articlesVal) {
      return
    }
    return articlesVal.map((article) => {
      const firstAuthors = article.author[0]
      const authors: string[] = []
      if (!firstAuthors) {
        authors.push('Unknown')
      }
      else {
        for (const author of article.author) {
          authors.push(`${author.given} ${author.family}`)
        }
      }
      const { 'date-parts': dateParts } = article.issued
      const year = dateParts?.[0]?.[0]
      const doi = article.DOI
      const journal = article['container-title']
      const abstract = article.abstract
      return {
        title: article.title,
        authors,
        year,
        doi,
        journal,
        abstract,
      } as BibliographyItem
    })
  })

  return {
    bibliography,
  }
}
