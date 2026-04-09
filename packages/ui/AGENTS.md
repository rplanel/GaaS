# AGENTS.md - @gaas/ui Nuxt UI Layer

## Section 1: Stack Definition With Exact Versions

| Component | Version | Purpose |
|-----------|---------|---------|
| **Nuxt** | ^4.3.0 (catalog:nuxt) | Framework |
| **@nuxt/ui** | ^4.6.1 (catalog:nuxt) | UI component library |
| **nuxt-galaxy** | workspace:* | Galaxy module integration |
| **@pinia/colada** | ^0.21.5 (catalog:vue) | Data fetching |
| **Mosaic** | ^0.21.1 (catalog:dataviz) | Data visualization |
| **D3** | ^7.9.0 (catalog:dataviz) | Charts & visualizations |
| **Meilisearch** | ^0.53.0 (catalog:) | Search engine |

### Layer Dependencies
- `nuxt-galaxy`: workspace:* (auto-registered)
- `@nuxt/ui`: ^4.6.1 (extends base)
- `@pinia/nuxt`: ^0.11.3 (state management)

## Section 2: Executable Commands With Full Flags

### Development (in .playground/)
```bash
pnpm dev                                    # Start dev server in .playground/
pnpm dev:prepare                           # Prepare playground
pnpm build                                 # Build playground
pnpm generate                              # Static generate
pnpm preview                               # Preview production build
```

### Quality Assurance
```bash
pnpm lint                                   # ESLint
pnpm typecheck                              # vue-tsc --noEmit
pnpm test                                   # Vitest
```

### Release
```bash
pnpm release:publish                        # Publish to npm
pnpm cleandep                              # Clean node_modules + generated files
```

## Section 3: Coding Conventions and Patterns

### Layer Architecture
```
app/
├── assets/css/main.css     # Global styles
├── components/             # Reusable UI components
├── composables/            # Shared composables
├── layouts/                # Page layouts
├── plugins/                # Nuxt plugins
└── utils/                  # Utility functions
nuxt.config.ts              # Layer configuration
.playground/                # Development playground
```

### Layer Configuration Pattern
```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  $meta: { name: '@gaas/ui' },
  modules: [
    '@nuxt/ui',
    '@nuxt/test-utils/module',
    '@nuxt/eslint',
    'nuxt-galaxy', // Galaxy integration
    '@pinia/colada-nuxt',
    '@pinia/nuxt',
  ],
  supabase: {
    types: false, // Use nuxt-galaxy types
  },
  runtimeConfig: {
    public: {
      meilisearch: {
        hostUrl: 'http://localhost:7700',
        searchApiKey: 'MASTER_KEY',
      },
    },
  },
  css: [join(currentDir, './app/assets/css/main.css')],
  vite: {
    optimizeDeps: {
      include: [
        '@uwdata/mosaic-core',
        '@uwdata/vgplot',
        'd3',
        'effect',
        'zod',
      ],
    },
  },
})
```

### Component Patterns
```vue
<!-- Uses @nuxt/ui components like <UButton>, <UCard> -->
<script setup lang="ts">
// Auto-imported from nuxt-galaxy
const { data: workflows, isLoading } = useGalaxyWorkflows()

async function handleAction() {
  // Use blendtype through nuxt-galaxy composables
  await invokeWorkflowEffect(workflowId)
}
</script>

<template>
  <UButton
    color="primary"
    :loading="isLoading"
    @click="handleAction"
  >
    {{ buttonText }}
  </UButton>
</template>
```

### Data Visualization Pattern
```typescript
// Use Mosaic for reactive data viz
import { vg } from '@uwdata/vgplot'

function createChart(data: Ref<any[]>) {
  return vg.plot(
    vg.dot(data.value, { x: 'timestamp', y: 'value' }),
    vg.ruleY([0])
  )
}
```

### State Management
```typescript
// Pinia Colada for server state
const { state } = useQuery({
  key: () => ['workflows'],
  query: () => $fetch('/api/galaxy/workflows'),
})
```

## Section 4: Testing Rules

### Test Commands
```bash
pnpm test                   # Run vitest
pnpm test:watch             # Watch mode
```

### Testing Standards
- **Framework**: Vitest + @vue/test-utils + happy-dom
- **Component Testing**: Test component behavior without full Nuxt runtime
- **Mocking**: Mock composables from nuxt-galaxy
- **Visual Testing**: Playwright for visual regression (optional)
- **E2E**: Use .playground/ for integration testing

### Test File Pattern
```typescript
import { mount } from '@vue/test-utils'
import MyComponent from './MyComponent.vue'

// Mock nuxt-galaxy composables
vi.mock('nuxt-galaxy', () => ({
  useGalaxyWorkflows: () => ({
    data: ref([]),
    isLoading: ref(false),
  }),
}))

describe('MyComponent', () => {
  it('renders correctly', () => {
    const wrapper = mount(MyComponent)
    expect(wrapper.text()).toContain('Expected Text')
  })
})
```

## Section 5: "Don't Touch" Zones and Permission Boundaries

### Protected Areas
1. **.playground/.nuxt/** - Auto-generated
2. **.playground/.output/** - Build output
3. **dist/** (if any) - Build artifacts

### Layer Boundaries
- **DO**: Create reusable UI components using @nuxt/ui
- **DO**: Create composables that wrap nuxt-galaxy functionality
- **DO**: Define data visualization utilities with Mosaic/D3
- **DON'T**: Import blendtype directly (go through nuxt-galaxy)
- **DON'T**: Define pages or content (that's for wiki/docs)
- **DON'T**: Access database directly (use API endpoints)

### Dependency Direction
```
Depends on:
  ↓ nuxt-galaxy (server logic)
  ↓ @nuxt/ui (base components)
  ↓ Mosaic/D3 (visualization)

Extended by:
  ↑ @gaas/wiki
  ↑ @gaas/docs
  ↑ apps/
```

### Using This Layer
```typescript
// In extending app/wiki
export default defineNuxtConfig({
  extends: ['@gaas/ui'],
  // Auto-inherits all UI components and composables
})
```

### Environment Variables
Access via runtime config (provided by nuxt-galaxy):
```typescript
const config = useRuntimeConfig()
config.public.galaxy.url // Galaxy API URL
config.public.meilisearch // Search config
```
