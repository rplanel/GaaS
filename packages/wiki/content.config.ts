import { defineCollection, defineContentConfig } from '@nuxt/content'
import { bibliographySchema, wikiPageSchema } from './app/schemas/wiki'

export default defineContentConfig({
  collections: {
    content: defineCollection({
      type: 'page',
      source: 'wiki/**/*.md',
      schema: wikiPageSchema,
    }),
    bibliography: defineCollection({
      type: 'data',
      source: 'bibliography/**/*.json',
      schema: bibliographySchema,
    }),
  },
})
