import { defineCollection, defineContentConfig } from '@nuxt/content'
import { landingSchema } from './app/schemas/landing'
import { bibliographySchema, wikiPageSchema } from './app/schemas/wiki'

// Placeholders: @nuxt/content reads a layer's collections from the layer's
// own `content/`, which ui does not ship. An app declares the same names
// over its own content, and each replaces the one here whole (ADR 0008).
export default defineContentConfig({
  collections: {
    landing: defineCollection({
      source: 'index.yml',
      type: 'page',
      schema: landingSchema,
    }),
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
