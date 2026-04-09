# AGENTS.md - @gaas/docs Documentation Site

## Section 1: Stack Definition With Exact Versions

| Component | Version | Purpose |
|-----------|---------|---------|
| **Nuxt** | ^4.3.0 (catalog:nuxt) | Framework |
| **@nuxt/content** | ^3.11.2 (catalog:nuxt) | Markdown docs |
| **@nuxt/ui** | ^4.6.1 (catalog:nuxt) | UI components |
| **nuxt-og-image** | ^5.1.12 (catalog:nuxt) | Social cards |
| **nuxt-llms** | ^0.1.3 (catalog:nuxt) | LLM-friendly docs |
| **embla-carousel** | ^8.6.0 (catalog:) | Carousels/galleries |

### Site Architecture
```
docs/
├── app/
│   ├── assets/css/main.css    # Global styles
│   ├── components/            # Custom components
│   │   ├── AppHeader.vue
│   │   ├── AppFooter.vue
│   │   ├── TemplateMenu.vue
│   │   └── OgImage/OgImageDocs.vue
│   ├── layouts/
│   │   └── docs.vue           # Documentation layout
│   └── pages/
│       ├── index.vue          # Homepage
│       └── [...slug].vue      # Dynamic doc pages
├── content/
│   └── docs/                  # Markdown documentation
├── public/                    # Static assets
├── nuxt.config.ts            # Site config
└── package.json
```

## Section 2: Executable Commands With Full Flags

### Development
```bash
pnpm dev                        # Start dev server
pnpm postinstall               # nuxt prepare (auto-runs)
```

### Build & Deploy
```bash
pnpm build                      # Build production
pnpm generate                   # Static generate
pnpm preview                    # Preview production build
```

### Quality Assurance
```bash
pnpm lint                       # ESLint
pnpm typecheck                  # nuxt typecheck
```

### Release (from root)
```bash
cd ..
pnpm docs:build                 # Build docs
pnpm docs:generate              # Generate static
```

### Dependency Management
```bash
pnpm cleandep                   # Clean node_modules + generated
pnpm install                    # Install dependencies
```

## Section 3: Coding Conventions and Patterns

### Site Configuration
```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/content',
    'nuxt-og-image',
    'nuxt-llms',
  ],

  content: {
    build: {
      markdown: {
        toc: { searchDepth: 1 }, // Auto TOC
      },
    },
  },

  nitro: {
    prerender: {
      routes: ['/'],
      crawlLinks: true,
    },
  },

  llms: {
    domain: 'https://docs-template.nuxt.dev/',
    title: 'GaaS Documentation',
    sections: [
      {
        title: 'Getting Started',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/getting-started%' },
        ],
      },
      {
        title: 'Essentials',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/essentials%' },
        ],
      },
    ],
  },
})
```

### Content Structure
```markdown
---
title: Getting Started
description: Your first steps with GaaS
icon: lucide:rocket
---

# Getting Started

Content here with full Markdown support.

## Features

- Auto-generated TOC
- Syntax highlighting
- MDC components
- Links: [Internal](/docs/installation)
```

### Writing Conventions
1. **Frontmatter**: Always include `title` and `description`
2. **Section headers**: Use ## for sections, ### for subsections
3. **TOC depth**: Set in `nuxt.config.ts` (default: 1)
4. **Internal links**: Use relative paths `/path/to/page`
5. **External links**: Use full URLs
6. **Code blocks**: Specify language
7. **Images**: Place in `public/`, reference with `/image.png`

### Content Organization
```
content/
├── docs/
│   ├── 1.getting-started/
│   │   ├── installation.md
│   │   └── configuration.md
│   ├── 2.essentials/
│   │   ├── galaxy-api.md
│   │   └── workflows.md
│   ├── 3.advanced/
│   │   └── custom-modules.md
│   └── index.md              # Docs homepage
```

### OG Image Pattern
```vue
<!-- app/components/OgImage/OgImageDocs.vue -->
<script setup lang="ts">
defineProps({
  title: String,
  description: String,
})
</script>

<template>
  <div class="og-image">
    <h1>{{ title }}</h1>
    <p>{{ description }}</p>
  </div>
</template>
```

## Section 4: Testing Rules

**Current**: No dedicated test commands defined

### Manual Testing Checklist
```bash
# Pre-deploy verification
pnpm typecheck                  # Type errors
pnpm build                      # Build success
pnpm generate                   # Static generation
node .output/server/index.mjs   # Test production
```

### Content Validation
- Verify all internal links work
- Check OG images generate correctly
- Test responsive design
- Validate LLM output at `/_llms.txt`

### Link Checking (manual)
```bash
# After build
cd .output/public
find . -name "*.html" -exec grep -l "404" {} \;  # Check for broken refs
```

## Section 5: "Don't Touch" Zones and Permission Boundaries

### Protected Areas
1. **.output/** - Build output (auto-generated)
2. **.data/** - Content database (auto-generated)
3. **dist/** - Generated static files
4. **.nuxt/** - Dev build files

### DOs and DON'Ts
- **DO**: Write clear documentation in `content/docs/`
- **DO**: Use frontmatter for all pages
- **DO**: Organize content with numbered prefixes (1.getting-started/)
- **DO**: Update `llms.sections` in config when adding sections
- **DO**: Use @nuxt/ui components for consistent styling
- **DON'T**: Add executable code (this is docs, not library)
- **DON'T**: Import from workspace packages (docs are standalone)
- **DON'T**: Commit build artifacts (.output, dist)
- **DON'T**: Use large binary assets in public/

### Content Restrictions
- **NO**: Package implementation code
- **NO**: Galaxy API credentials
- **NO**: Production database connections
- **NO**: Confidential information

### LLM Documentation
- Auto-generated at `/_llms.txt`
- Includes all docs collections
- Filters configured in `nuxt.config.ts`
- Keep content machine-readable
