<!--
Get your module up and running quickly.

Find and replace all on all files (CMD+SHIFT+F):
- Name: My Module
- Package name: my-module
- Description: My new Nuxt module
-->

# Nuxt Galaxy

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

My new Nuxt module for doing amazing things.

- [✨ &nbsp;Release Notes](/CHANGELOG.md)
  <!-- - [🏀 Online playground](https://stackblitz.com/github/your-org/my-module?file=playground%2Fapp.vue) -->
  <!-- - [📖 &nbsp;Documentation](https://example.com) -->

## Features

<!-- Highlight some of the features your module provide here -->

- ⛰ &nbsp;Foo
- 🚠 &nbsp;Bar
- 🌲 &nbsp;Baz

## Quick Setup

Install the module to your Nuxt application with one command:

```bash
npx nuxi module add my-module
```

That's it! You can now use My Module in your Nuxt app ✨

## Using Database Types

The module exports Supabase database types that are automatically available in your Nuxt application. You can use them in several ways:

### 1. Direct Import from Module

Import types directly from the module for use in your components or composables:

```typescript
import type { Database } from 'nuxt-galaxy'

// Access table types directly from the Database type
type Analysis = Database['galaxy']['Tables']['analyses']['Row']
type AnalysisInsert = Database['galaxy']['Tables']['analyses']['Insert']
type AnalysisUpdate = Database['galaxy']['Tables']['analyses']['Update']

// Access enum types
type JobState = Database['galaxy']['Enums']['job_state']
type InvocationState = Database['galaxy']['Enums']['invocation_state']

// Use in your code
const analysis: Partial<Analysis> = {
  name: 'My Analysis',
  state: 'new',
  // TypeScript will provide autocomplete for all fields
}
```

### 2. Auto-generated Types in `.nuxt`

The module automatically generates type definitions in your `.nuxt` directory that are globally available:

```typescript
// In any component or composable
import type { GalaxyTypes } from '#build/types/nuxt-galaxy'
import type { SupabaseTypes } from '#build/types/database'

// Use the full Database type
type DB = SupabaseTypes.Database
```

### 3. With Supabase Client

When using the Supabase client provided by `@nuxtjs/supabase`, the database types are automatically typed:

```typescript
import type { Database } from 'nuxt-galaxy'

const client = useSupabaseClient<Database>()

// TypeScript knows about your schema
const { data } = await client
  .from('analyses')
  .select('*')
  .eq('id', 1)
  .single()
// data is typed as Database['galaxy']['Tables']['analyses']['Row']
```

### Available Types

- `Database` - Complete database schema including all tables, views, functions, and enums for all schemas (galaxy, storage, etc.)
- `Tables<TableName>` - Helper type for public schema tables
- `TablesInsert<TableName>` - Helper type for insert payloads in public schema
- `TablesUpdate<TableName>` - Helper type for update payloads in public schema
- `Enums<EnumName>` - Helper type for public schema enums
- `Json` - Generic JSON type

**Note:** Since this module uses the `galaxy` schema (not `public`), it's recommended to access types directly via the `Database` type as shown in the examples above.

### Example: Complete Type-Safe Query

```typescript
import type { Database } from 'nuxt-galaxy'

type Analysis = Database['galaxy']['Tables']['analyses']['Row']
type AnalysisInsert = Database['galaxy']['Tables']['analyses']['Insert']
type InvocationState = Database['galaxy']['Enums']['invocation_state']

const client = useSupabaseClient<Database>()

// Insert with full type safety
const newAnalysis: AnalysisInsert = {
  name: 'RNA-Seq Analysis',
  galaxy_id: 'abc123',
  history_id: 1,
  workflow_id: 1,
  owner_id: 'user-123',
  datamap: {},
  parameters: {},
  invocation: {},
  state: 'new' as InvocationState,
}

const { data, error } = await client
  .from('analyses')
  .insert(newAnalysis)
  .select()
  .single()

// data is typed as Analysis
if (data) {
  console.log(data.name) // TypeScript knows all properties
}
```

### Regenerating Types

To regenerate database types after schema changes:

```bash
cd packages/nuxt-galaxy
pnpm run supabase:generate:types
```

This will update `src/runtime/types/database.ts` with the latest schema from your Supabase instance.

### Database schema

If you are using kubernetes to deploy a webservices using GaaS nuxt-galaxy module, you might need to get the database schema as yaml.
To do that you can use this script like :

```bash
# Using xclip as an example
./scripts/kube-db-migrations.sh supabase/migrations/ | xclip -sel clipboard
```

## Contribution

<details>
  <summary>Local development</summary>

```bash
# Install dependencies
npm install

# Generate type stubs
npm run dev:prepare

# Develop with the playground
npm run dev

# Build the playground
npm run dev:build

# Run ESLint
npm run lint

# Run Vitest
npm run test
npm run test:watch

# Release new version
npm run release
```

</details>

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/my-module/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/my-module
[npm-downloads-src]: https://img.shields.io/npm/dm/my-module.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/my-module
[license-src]: https://img.shields.io/npm/l/my-module.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/my-module
[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt.js
[nuxt-href]: https://nuxt.com
