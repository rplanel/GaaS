import { defineCollection, defineContentConfig } from '@nuxt/content'
// Import shared schemas
import { landingSchema } from '../packages/ui/app/schemas/landing'
import { bibliographySchema, wikiPageSchema } from '../packages/ui/app/schemas/wiki'

export default defineContentConfig({
  collections: {
    // Landing page — sourced from playground/content/index.yml
    landing: defineCollection({
      source: 'index.yml',
      type: 'page',
      schema: landingSchema,
    }),

    // Wiki content
    content: defineCollection({
      type: 'page',
      source: 'wiki/**/*.md',
      schema: wikiPageSchema,
    }),

    // Bibliography data
    bibliography: defineCollection({
      type: 'data',
      source: 'bibliography/**/*.json',
      schema: bibliographySchema,
    }),
  },
})
