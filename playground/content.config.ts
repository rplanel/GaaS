import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    content: defineCollection({
      type: 'page',
      source: 'wiki/**/*.md',
    }),
    bibliography: defineCollection({
      type: 'data',
      source: 'bibliography/**/*.json',
      schema: z.object({
        'DOI': z.string(),
        'title': z.string(),
        'container-title': z.string(),
        'type': z.union([
          z.literal('article-journal'),
          z.literal('article'),
          z.literal('article-newspaper'),
          z.literal('book'),
          z.literal('chapter'),
          z.literal('paper-conference'),
          z.literal('thesis'),
          z.literal('webpage'),
        ]),
        'abstract': z.string().optional(),
        'author': z.array(z.object({
          family: z.string(),
          given: z.string(),
        })),
        'issued': z.object({
          'date-parts': z.array(z.array(z.coerce.number())),
        }),
      }),
    }),
  },
})
