import { defineCollection, defineContentConfig } from '@nuxt/content'
import { landingSchema } from './app/schemas/landing'

export default defineContentConfig({
  collections: {
    landing: defineCollection({
      source: 'index.yml',
      type: 'page',
      schema: landingSchema,
    }),
  },
})
