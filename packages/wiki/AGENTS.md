# AGENTS.md - @gaas/wiki Content Layer

## Section 1: Stack Definition With Exact Versions

| Component | Version | Purpose |
|-----------|---------|---------|
| **Nuxt** | ^4.3.0 (catalog:nuxt) | Framework |
| **@gaas/ui** | workspace:^ | Parent layer (UI components) |
| **@nuxt/content** | ^3.11.2 (catalog:nuxt) | Markdown content |
| **better-sqlite3** | ^12.4.6 (catalog:) | Content database |
| **nuxt-studio** | ^1.1.0 (catalog:nuxt) | Content editing |
| **Embla Carousel** | ^8.6.0 (catalog:) | Image galleries |
| **Zod** | ^4.3.6 (catalog:) | Content validation |

### Layer Extension Chain
```
@gaas/wiki (this layer)
  ↓ extends
@gaas/ui (UI components + composables)
  ↓ depends on
nuxt-galaxy (Galaxy integration)
```

### Key Dependencies
- `@gaas/ui`: workspace:^ (inherits all UI components)
- `@nuxt/content`: ^3.11.2 (collections, queries)
- `zod-validation-error`: ^5.0.0 (error formatting)

## Section 2: Executable Commands With Full Flags

### Development (in .playground/)
```bash
pnpm dev                                    # Dev server with content hot-reload
pnpm dev:prepare                           # Prepare Nuxt + playground
pnpm build                                 # Build production
pnpm generate                              # Static site generation
pnpm preview                               # Preview build
```

### Content Management
```bash
pnpm content:query                          # Validate content queries
pnpm content:generate                       # Regenerate content database
```

### Quality Assurance
```bash
pnpm lint                                   # ESLint
pnpm typecheck                              # vue-tsc
pnpm test                                   # Vitest
```

### Release
```bash
pnpm release:publish                        # Publish layer to npm
pnpm cleandep                              # Clean all generated files
```

## Section 3: Coding Conventions and Patterns

### Layer Structure
```
app/
├── components/             # Wiki-specific components
├── composables/            # Content query composables
├── content/                # ✨ Markdown content collections
│   ├── blog/              # Blog posts
│   ├── docs/              # Documentation
│   └── tutorials/         # Tutorials
├── layouts/                # Content-focused layouts
├── pages/                  # ✨ Dynamic content pages
├── plugins/                # Content hooks
└── utils/                  # Content utilities
nuxt.config.ts              # Layer config
content.config.ts           # Content collections config
.playground/                # Dev playground with content
```

### Layer Configuration Pattern
```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@gaas/ui'], // Inherit UI layer
  $meta: { name: '@gaas/wiki' },
  modules: [
    '@nuxt/content',
    'nuxt-studio',
  ],
  content: {
    database: { type: 'sqlite', filename: '.data/content.db' },
    navigation: {
      fields: ['title', 'description', 'category'],
    },
  },
  hooks: {
    // DOI extraction for bibliography
    'content:file:beforeParse': async (file) => {
      // Extract DOIs from content
      // Generate bibliography
    },
  },
})
```

### Content Collections Configuration
```typescript
// content.config.ts
import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    blog: defineCollection({
      source: 'blog/*.md',
      type: 'page',
      schema: z.object({
        title: z.string(),
        date: z.date(),
        authors: z.array(z.string()),
        tags: z.array(z.string()).default([]),
        doi: z.string().optional(),
      }),
    }),
  },
})
```

### Content Page Pattern
```vue
<!-- pages/[...slug].vue -->
<script setup lang="ts">
const { page } = await useContent()
</script>

<template>
  <div class="wiki-container">
    <UPageHeader :title="page?.title" :description="page?.description" />

    <ContentRenderer v-if="page" :value="page" class="prose" />

    <!-- Bibliography auto-generated from DOIs -->
    <Bibliography v-if="page?.doi" :dois="[page.doi]" />
  </div>
</template>
```

### Content Composable Pattern
```typescript
// Get latest blog posts
const { data: posts } = await useAsyncData('latest', () =>
  queryCollection('blog')
    .order('date', 'DESC')
    .limit(10)
    .all())

// With filtering
const { data: tutorials } = await useAsyncData('tutorials', () =>
  queryCollection('tutorials')
    .where('category', 'IN', ['beginner', 'intermediate'])
    .order('publishedAt', 'DESC')
    .all())
```

### DOI/Bibliography Pattern
```typescript
// Extract DOIs from content
function extractDois(content: string): string[] {
  const doiRegex = /10\.\d{4,}\/\S+/g
  return [...content.matchAll(doiRegex)].map(m => m[0])
}

// Fetch citation data
async function fetchCitation(doi: string) {
  const response = await $fetch(`https://doi.org/${doi}`, {
    headers: { Accept: 'application/vnd.citationstyles.csl+json' }
  })
  return response
}
```

## Section 4: Testing Rules

### Test Commands
```bash
pnpm test                   # Run vitest
pnpm test:watch             # Watch mode
```

### Testing Standards
- **Content Testing**: Validate content schema with Zod
- **Link Checking**: Verify internal/external links work
- **Query Testing**: Test content queries work correctly
- **E2E**: Playwright tests for content navigation
- **Bibliography**: Test DOI resolution

### Content Validation Test
```typescript
import { describe, expect, it } from 'vitest'
import { collections } from '../content.config'

describe('Content Schema', () => {
  it('validates blog posts', async () => {
    const posts = await queryCollection('blog').all()
    posts.forEach((post) => {
      expect(collections.blog.schema.parse(post)).toBeTruthy()
    })
  })
})
```

## Section 5: "Don't Touch" Zones and Permission Boundaries

### Protected Areas
1. **.data/content.db** - SQLite database (auto-generated from markdown)
2. **.playground/.nuxt/content/** - Compiled content
3. **dist/** - Generated static files

### Layer Boundaries
- **DO**: Create content collections and query composables
- **DO**: Extend UI components for content display
- **DO**: Implement DOI extraction and bibliography
- **DO**: Create content-focused layouts
- **DON'T**: Import nuxt-galaxy directly (use through @gaas/ui)
- **DON'T**: Modify UI components (do that in @gaas/ui)
- **DON'T**: Access galaxy API directly (use nuxt-galaxy composables)

### Dependency Rules

TODO

### Content Authoring Guidelines
1. Use frontmatter for metadata (title, date, tags, DOI)
2. Images in `public/content/` directory
3. Cross-references with relative paths `/docs/guides/setup`
4. Code blocks with language specification
5. DOIs in `doi: 10.xxxx/xxxx` format

### Environment Variables
Access through @gaas/ui runtime config:
```typescript
const config = useRuntimeConfig()
// These come from nuxt-galaxy through @gaas/ui
config.public.galaxy.url
config.public.meilisearch
```
