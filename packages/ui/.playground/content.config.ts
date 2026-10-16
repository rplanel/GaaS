import { defineCollection, defineContentConfig } from '@nuxt/content'
import { wikiPageSchema } from '../app/schemas/wiki'

// The layer's `content` collection reads nothing (see its content.config.ts),
// so the playground declares it over its own `content/wiki/`, as an app does.
export default defineContentConfig({
  collections: {
    content: defineCollection({
      type: 'page',
      source: 'wiki/**/*.md',
      schema: wikiPageSchema,
    }),
  },
})
