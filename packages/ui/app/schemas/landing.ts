import { z } from '@nuxt/content'

export function createLinkSchema() {
  return z.object({
    label: z.string().nonempty(),
    to: z.string().nonempty(),
    icon: z.string().optional(),
    trailingIcon: z.string().optional(),
    size: z.enum(['xs', 'sm', 'md', 'lg', 'xl']).optional(),
    target: z.enum(['_blank', '_self']).optional(),
    color: z.enum(['primary', 'secondary', 'neutral', 'error', 'warning', 'success', 'info']).optional(),
    variant: z.enum(['solid', 'outline', 'subtle', 'soft', 'ghost', 'link']).optional(),
  })
}

export const landingSchema = z.object({
  seo: z.object({
    title: z.string(),
    description: z.string(),
  }).optional(),
  title: z.string(),
  description: z.string(),
  hero: z.object({
    headline: z.string().optional(),
    titleSplit: z.string().default('\n'),
    links: z.array(createLinkSchema()),
  }),
  logos: z.object({
    title: z.string(),
    items: z.array(z.string()),
  }),
  features: z.object({
    headline: z.string().optional(),
    title: z.string(),
    description: z.string(),
    items: z.array(z.object({
      icon: z.string(),
      title: z.string(),
      description: z.string(),
    })),
  }),
  metrics: z.object({
    headline: z.string().optional(),
    title: z.string(),
    description: z.string(),
    items: z.array(z.object({
      value: z.string(),
      label: z.string(),
      class: z.string(),
    })),
  }),
  cta: z.object({
    title: z.string(),
    description: z.string(),
    command: z.string().optional(),
    links: z.array(createLinkSchema()),
  }),
})
