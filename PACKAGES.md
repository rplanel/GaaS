# GaaS Packages Documentation

This document provides comprehensive documentation for all packages in the GaaS (Galaxy as a Service) monorepo.

## Package Overview

The GaaS monorepo consists of several interconnected packages designed to provide a complete toolkit for building Galaxy-integrated web applications:

- **[blendtype](#blendtype)** - TypeScript client for Galaxy REST API
- **[nuxt-galaxy](#nuxt-galaxy)** - Nuxt module for Galaxy integration
- **[ui](#ui)** - UI layer with Galaxy-specific components
- **[wiki](#wiki)** - Documentation and wiki layer
- **[gaas-cli](#gaas-cli)** - Command-line interface for GaaS operations

---

## blendtype

**Version**: 0.0.3-alpha.5
**Type**: TypeScript Library
**License**: MIT

### Description

Blendtype is a TypeScript client library for interacting with the [Galaxy](https://galaxyproject.org/) REST API. It provides strongly-typed functions and models for common Galaxy operations, including managing histories, datasets, jobs, tools, workflows, and invocations.

### Features

- **Type-safe API** for all major Galaxy resources
- **Effect-based API** using [Effect-TS](https://effect.website/) for composable and robust workflows
- **Cross-platform support** - Works in Node.js, Deno, Bun, and browser environments
- **Authentication handling** - Manages Galaxy API key authentication
- **Error management** - Comprehensive error handling with typed errors
- **Extensible architecture** - Supports additional Galaxy endpoints as needed

### Installation

```bash
# npm
npm install blendtype

# pnpm
pnpm add blendtype

# yarn
yarn add blendtype
```

### Usage

#### Basic Configuration

```typescript
import { initializeGalaxyClient, createHistory, uploadFileToHistory } from 'blendtype'

// Initialize the client
initializeGalaxyClient({
  apiKey: process.env.GALAXY_API_KEY,
  url: 'https://your-galaxy-server.org'
})

// Create a history
const history = await createHistory('My Analysis')

// Upload a file
const uploadResult = await uploadFileToHistory({
  historyId: history.id,
  srcUrl: 'https://example.com/data.txt',
  name: 'input-data.txt'
})
```

#### Effect-based Usage

```typescript
import { Effect } from 'effect'
import { createHistoryEffect, uploadFileToHistoryEffect } from 'blendtype'

const program = Effect.gen(function* () {
  // Create history
  const history = yield* createHistoryEffect('My Analysis')

  // Upload file
  const dataset = yield* uploadFileToHistoryEffect({
    historyId: history.id,
    blob: myBlob,
    name: 'data.txt'
  })

  return { history, dataset }
})
```

### Core Functions

- **Histories**: `createHistory`, `getHistory`, `deleteHistory`, `uploadFileToHistory`
- **Datasets**: `getDataset`, `downloadDataset`
- **Workflows**: `getWorkflows`, `getWorkflow`, `invokeWorkflow`
- **Jobs**: `getJob`, `getJobOutputs`
- **Tools**: `getTool`, `getTools`
- **Invocations**: `getInvocation`, `getInvocationOutputs`

---

## nuxt-galaxy

**Version**: 0.0.3-alpha.3
**Type**: Nuxt Module
**License**: MIT

### Description

A comprehensive Nuxt module that provides seamless integration with Galaxy Project APIs and Supabase database operations. It offers both client-side composables and server-side utilities for building Galaxy-integrated applications.

### Features

- **Galaxy API Integration** - Server-side endpoints for Galaxy operations
- **Supabase Integration** - Database operations with type-safe schemas
- **Vue Composables** - Reactive composables for client-side Galaxy interactions
- **Authentication** - User role management and authentication handling
- **Real-time Sync** - Automatic synchronization between Galaxy and database
- **TypeScript Support** - Full type safety with generated types

### Installation

```bash
pnpm add nuxt-galaxy
```

### Configuration

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-galaxy'],

  // Optional: Configure via runtime config
  runtimeConfig: {
    galaxy: {
      apiKey: process.env.GALAXY_API_KEY,
      email: process.env.GALAXY_EMAIL,
      drizzle: {
        databaseUrl: process.env.GALAXY_DRIZZLE_DATABASE_URL
      }
    },
    public: {
      galaxy: {
        url: process.env.GALAXY_URL
      }
    }
  }
})
```

### Environment Variables

```bash
# Galaxy Configuration
GALAXY_URL="https://your-galaxy-server.org"
GALAXY_API_KEY="your-galaxy-api-key"
GALAXY_EMAIL="your-galaxy-email"

# Database Configuration
GALAXY_DRIZZLE_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Supabase Configuration
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_KEY="your-supabase-anon-key"
```

### Client-Side Composables

#### Core Analysis Composables

- **`useAnalysisDetails(analysisId)`** - Complete analysis data management
- **`useWorkflowAnalyses(workflowId)`** - Workflow analysis operations

#### Galaxy Integration Composables

- **`useGalaxyWorkflow(workflowId)`** - Galaxy workflow data and operations
- **`useGalaxyTool(toolQueries)`** - Galaxy tool information and parameters
- **`useGalaxyHint(help, argument)`** - Contextual hints for Galaxy operations

#### Utility Composables

- **`useFileSize(bytes)`** - Human-readable file size formatting
- **`useDiskUsage()`** - Storage usage monitoring
- **`useErrorMessage(error)`** - Standardized error message handling
- **`useErrorStatus(error)`** - HTTP status code management
- **`useUserRole(supabase)`** - User authentication and role management
- **`useUploadFileToStorage(options)`** - File upload to Supabase storage

### Server-Side API Endpoints

#### Galaxy Endpoints

- `GET /api/galaxy/instance` - Galaxy instance information
- `GET /api/galaxy/histories` - List Galaxy histories
- `GET /api/galaxy/workflows` - List Galaxy workflows
- `GET /api/galaxy/workflows/:workflowId` - Get specific workflow
- `GET /api/galaxy/tools/:toolId/:toolVersion` - Get tool information

#### Database Endpoints

- `POST /api/db/workflows` - Create workflow in database
- `POST /api/db/analyses` - Create analysis record
- `DELETE /api/db/analyses/:analysisId` - Delete analysis

#### Synchronization

- `GET /sync` - Synchronize Galaxy data with database

### Database Schema

The module includes comprehensive database schemas for:

- **Users & Roles** - User management and role-based permissions
- **Workflows** - Galaxy workflow metadata and definitions
- **Analyses** - Analysis tracking and management
- **Datasets** - Dataset metadata and storage references
- **Histories & Jobs** - Galaxy history and job tracking

---

## ui

**Version**: 0.0.1-alpha.0
**Type**: Nuxt Layer
**License**: MIT

### Description

A Nuxt layer providing UI components and layouts specifically designed for Galaxy workflow applications. Built on top of Nuxt UI Pro with custom Galaxy-specific components and styling.

### Features

- **Galaxy-specific Components** - Specialized components for Galaxy workflows
- **Responsive Layouts** - Mobile-first responsive design
- **Dark Mode Support** - Built-in dark/light mode switching
- **Nuxt UI Pro Integration** - Extends Nuxt UI Pro components
- **Tailwind CSS** - Utility-first CSS framework
- **TypeScript Support** - Full type safety

### Installation

```bash
pnpm add @gaas/ui
```

### Usage

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@gaas/ui']
})
```

### CSS Configuration

```css
/* app/assets/css/main.css */
@import 'tailwindcss';
@import '@nuxt/ui';

@source "../../../node_modules/@gaas/ui";
```

### Components & Layouts

#### Layouts

- **`default.vue`** - Main application layout with navigation
- **`landing.vue`** - Landing page layout

#### Pages

- **Dataset Management** - File upload, management, and organization
- **Workflow Interface** - Workflow selection and configuration
- **Analysis Dashboard** - Analysis monitoring and results
- **Admin Panel** - User and workflow administration

#### Navigation

The UI layer provides a configurable navigation system:

```typescript
// app.config.ts
export default defineAppConfig({
  gaasUi: {
    navigationMenuItems: [
      {
        label: 'Datasets',
        icon: 'i-lucide-files',
        to: '/datasets',
        order: 1,
      },
      {
        label: 'Workflows',
        icon: 'i-lucide:workflow',
        to: '/workflows',
        order: 2,
      }
      // ... more items
    ]
  }
})
```

### Styling

The UI layer uses a custom design system built on Tailwind CSS:

- **Custom Color Palette** - Galaxy-themed color scheme
- **Typography Scale** - Consistent typography hierarchy
- **Component Variants** - Standardized component styling
- **Responsive Breakpoints** - Mobile-first responsive design

---

## wiki

**Version**: 0.0.1-alpha.0
**Type**: Nuxt Layer
**License**: MIT

### Description

A specialized Nuxt layer for creating documentation and wiki sites. Extends the UI layer with content management capabilities using Nuxt Content.

### Features

- **Content Management** - Markdown-based content with frontmatter
- **Search Functionality** - Full-text search across content
- **Navigation Generation** - Automatic navigation from content structure
- **SEO Optimization** - Built-in SEO meta tags and OpenGraph
- **Responsive Design** - Mobile-optimized documentation layout

### Installation

```bash
pnpm add @gaas/wiki
```

### Usage

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@gaas/wiki']
})
```

### Content Structure

```
content/
├── wiki/
│   ├── getting-started/
│   │   ├── index.md
│   │   └── installation.md
│   └── guides/
│       └── workflow-creation.md
```

### Configuration

```typescript
// app.config.ts
export default defineAppConfig({
  gaasWiki: {
    name: 'My Documentation',
    seo: {
      title: 'Documentation Site',
      titleTemplate: '%s - Docs'
    }
  }
})
```

### Features

#### Layout Components

- **Wiki Navigation** - Sidebar navigation with search
- **Table of Contents** - Auto-generated page TOC
- **Content Search** - Integrated search functionality

#### Content Features

- **Markdown Support** - Full markdown with extensions
- **Code Highlighting** - Syntax highlighting for code blocks
- **Component Integration** - Vue components in markdown
- **Frontmatter** - YAML frontmatter for metadata

---

## gaas-cli

**Version**: 0.1.0
**Type**: Python CLI Tool
**License**: MIT

### Description

A command-line interface for GaaS operations, built with Python and Typer. Provides utilities for bibliography management and other GaaS-related tasks.

### Features

- **Bibliography Management** - Zotero integration for reference management
- **Rich CLI Interface** - Beautiful terminal output with Rich
- **Extensible Commands** - Modular command structure
- **Configuration Management** - Environment-based configuration

### Installation

```bash
# With uv (recommended)
uv add gaas-cli

# With pip
pip install gaas-cli
```

### Usage

```bash
# Show help
gaas --help

# Bibliography operations
gaas biblio --help

# Example command
gaas hello "World"
```

### Dependencies

- **typer** - CLI framework
- **rich** - Terminal formatting
- **python-dotenv** - Environment configuration
- **pyzotero** - Zotero API integration
- **requests** - HTTP client
- **python-frontmatter** - Markdown frontmatter parsing

### Commands

#### Bibliography Management

- `gaas biblio list` - List bibliography entries
- `gaas biblio sync` - Sync with Zotero
- `gaas biblio export` - Export bibliography data

---

## Development

### Prerequisites

- Node.js 18+ with pnpm
- Python 3.13+ (for gaas-cli)
- PostgreSQL (for database operations)

### Setup

```bash
# Clone repository
git clone https://github.com/rplanel/GaaS.git
cd GaaS

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration
```

### Development Commands

```bash
# Run development server
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Type check
pnpm typecheck
```

### Package Structure

```
packages/
├── blendtype/          # Galaxy TypeScript client
├── nuxt-galaxy/        # Nuxt module
├── ui/                 # UI layer
├── wiki/               # Documentation layer
└── gaas-cli/           # CLI tool
```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Ensure linting passes
6. Submit a pull request

### Coding Standards

- **TypeScript** for all JavaScript/Node.js code
- **Vue 3 + Composition API** for Vue components
- **Effect-TS** for functional programming patterns
- **Drizzle ORM** for database operations
- **ESLint + Antfu config** for code linting

---

## License

All packages are licensed under the MIT License. See [LICENSE](./LICENSE) for details.

---

## Links

- **Repository**: https://github.com/rplanel/GaaS
- **Documentation**: https://gaas-docs.example.org
- **Galaxy Project**: https://galaxyproject.org
- **Issues**: https://github.com/rplanel/GaaS/issues
