import { defineCollection, defineContentConfig } from '@nuxt/content'
import { bibliographySchema, wikiPageSchema } from '../app/schemas/wiki'

// The layer's `content` and `bibliography` collections are placeholders
// (see its content.config.ts), so the playground declares both over its own
// `content/`, as an app does: its sample wiki page cites `10/100` and
// `10/101`, and `content/bibliography/` holds the two matching records.
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
