# AGENTS.md - nuxt-galaxy Nuxt Module

## Section 1: Stack Definition With Exact Versions

| Component | Version | Purpose |
|-----------|---------|---------|
| **Nuxt** | ^4.3.0 (catalog:nuxt) | Framework |
| **Drizzle ORM** | ^1.0.0-beta.16 (catalog:) | Database access |
| **Supabase** | ^2.72.8 (catalog:) | Auth + Database |
| **Effect-TS** | ^3.19.6 (catalog:) | Server-side effects |
| **@nuxt/kit** | ^4.3.0 (catalog:nuxt) | Module development |
| **Drizzle-Kit** | ^1.0.0-beta.16 (catalog:) | Migrations |
| **JWT Decode** | ^4.0.0 (catalog:) | Token parsing |

### Module Dependencies
- `@nuxtjs/supabase`: ^2.0.4 (auto-configured)
- `@nuxt/content`: ^3.11.2 (content management)
- `blendtype`: workspace:* (Galaxy API client)

## Section 2: Executable Commands With Full Flags

### Development
```bash
# Dev with playground
pnpm dev                                    # Start Nuxt dev with playground
pnpm dev:build                             # Build playground
pnpm dev:prepare                           # Prepare module + playground
```

### Testing & Linting
```bash
pnpm lint                                   # ESLint check
pnpm typecheck                              # vue-tsc + playground typecheck
pnpm test                                   # Vitest run
pnpm test:watch                             # Vitest watch mode
```

### Supabase Commands
```bash
pnpm supabase:start                         # Start local Supabase
pnpm supabase:stop                          # Stop Supabase
pnpm supabase:status                        # Check status
pnpm supabase:db:reset                      # Reset database
pnpm supabase:migration:new <name>          # Create new migration
pnpm supabase:migration:up                  # Run pending migrations
pnpm supabase:migration:galaxy:create       # Create all Galaxy migrations
pnpm supabase:generate:types                # Generate TypeScript types
```

### Drizzle Commands
```bash
pnpm drizzle:generate                       # Generate migration files
pnpm drizzle:migrate                        # Run migrations
```

### Database Seeding
```bash
pnpm db:seed                                # Seed with defaults
pnpm db:seed:example                        # Seed Galaxy@Pasteur
pnpm db:seed:help                           # Show seed options
```

### Release
```bash
pnpm prepack                                # Build module (dev:prepare + nuxt-module-build)
pnpm release:publish                        # Publish to npm
```

### CLI Binary
```bash
nuxt-galaxy-migrate                         # Run migrations manually
```

## Section 3: Coding Conventions and Patterns

### Module Structure
```
src/
├── module.ts               # Module definition & setup
├── runtime/
│   ├── app/
│   │   ├── composables/    # Auto-imported composables
│   │   ├── queries/        # Pinia Colada queries
│   │   └── utils/          # Shared utilities
│   ├── server/
│   │   ├── api/            # API handlers
│   │   ├── lib/migrate.js  # Migration utilities
│   │   ├── plugins/        # Nitro plugins
│   │   └── utils/          # Server utilities
│   └── types/
│       ├── database.ts     # Generated Supabase types
│       └── nuxt-galaxy.ts  # Module types
```

### Module Definition Pattern
```typescript
export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-galaxy',
    configKey: 'galaxy',
    compatibility: { nuxt: '>=4.0.0' },
  },
  moduleDependencies: {
    '@nuxtjs/supabase': { version: '^2.0.3', defaults: {} },
  },
  defaults: {
    url: process.env.GALAXY_URL || 'http://localhost:9000',
    apiKey: process.env.GALAXY_API_KEY || 'fakekey',
    email: process.env.GALAXY_EMAIL || 'admin@example.org',
    databaseUrl: process.env.GALAXY_DRIZZLE_DATABASE_URL || '...',
    runMigrations: false,
  },
  async setup(options, nuxt) {
    // Runtime config
    nuxt.options.runtimeConfig.public.galaxy = { url: options.url }
    nuxt.options.runtimeConfig.galaxy = {
      apiKey: options.apiKey,
      email: options.email,
      drizzle: { databaseUrl: options.databaseUrl }
    }

    // Register composables
    addImports({ name: 'useGalaxyTool', from: resolver.resolve() })
    addImportsDir(resolver.resolve('./runtime/app/queries'))

    // Server API
    addServerHandler({ route: '/api/galaxy/workflows', handler: {} })
    addServerPlugin(resolver.resolve('./runtime/server/plugins/galaxy.server'))

    if (options.runMigrations) {
      addServerPlugin(resolver.resolve('./runtime/server/plugins/migrations.server'))
    }
  }
})
```

### Server API Pattern
```typescript
// runtime/server/api/galaxy/workflows.get.ts
import { getWorkflowsEffect } from 'blendtype'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const workflow = await Effect.runPromise(
    getWorkflowsEffect().pipe(
      Effect.provide(GalaxyFetch.Live),
      Effect.provide(Layer.succeed(BlendTypeConfig, config.galaxy))
    )
  )
  return workflow
})
```

### Configuration Options
```typescript
interface ModuleOptions {
  url: string // GALAXY_URL default
  apiKey: string // GALAXY_API_KEY default
  email: string // GALAXY_EMAIL default
  databaseUrl: string // GALAXY_DRIZZLE_DATABASE_URL default
  runMigrations: boolean // false - run on startup
}
```

## Section 4: Testing Rules

### Test Commands
```bash
pnpm test                   # Run all tests
pnpm test:watch             # Watch mode
pnpm --filter . vitest run  # From root
```

### Testing Standards
- **Framework**: Vitest with @nuxt/test-utils
- **Server Testing**: Test Nitro handlers with mock HTTP requests
- **Database**: Use Supabase test containers or migrate test DB
- **Mocking**: Mock `blendtype` functions, don't call real Galaxy API
- **Coverage**: Tracked via @vitest/coverage-v8

### Test File Locations
- Unit: `test/` directory
- API tests: Test files alongside handlers or in `test/server/`

## Section 5: "Don't Touch" Zones and Permission Boundaries

### Protected Files
1. **src/runtime/types/database.ts** - Generated by Supabase CLI
2. **supabase/migrations/** - Managed by drizzle-kit, edit via SQL
3. **dist/** - Auto-generated by nuxt-module-build
4. **playground/.nuxt/** - Auto-generated, never commit

### Permission Boundaries
- **Server-Only**: Drizzle ORM operations must stay in server/
- **Runtime Config**: Secrets in private config, URLs in public
- **blendtype**: Use through workspace dependency only
- **Database**: Never expose raw SQL to client

### Environment Variables (Required)
```bash
GALAXY_URL=http://localhost:9000
GALAXY_API_KEY=fakekey
GALAXY_EMAIL=admin@example.com
SUPABASE_URL=http://localhost:54321
SUPABASE_KEY=...
GALAXY_DRIZZLE_DATABASE_URL=postgresql://...
```

### Migration Rules
- ALWAYS use `drizzle-kit generate` to create migrations
- NEVER edit files in supabase/migrations/ directly
- Run `supabase:generate:types` after schema changes
- Test migrations with `supabase:db:reset` before committing
