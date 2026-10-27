// https://nuxt.com/docs/api/configuration/nuxt-config
import type { FileAfterParseHook } from '@nuxt/content'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from 'nuxt/kit'
import { parseDois, searchContentRef } from './app/utils/content/search'

// import { createResolver } from '@nuxt/kit'

// const { resolve } = createResolver(import.meta.url)

const currentDir = dirname(fileURLToPath(import.meta.url))
const log = logger.withTag('@gaas/ui')

// import { defineNuxtConfig } from 'nuxt/config'

// const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  // alias: { '@gaas/ui': resolve('./') },
  devtools: { enabled: true },
  $meta: {
    name: '@gaas/ui',
  },
  // Studio is a dev tool: the docs promise it in dev only, and in production
  // it needs a repository and authentication that only the app can name.
  // nuxt-studio 1.7.0, which the workspace locks, otherwise throws
  // "Repository owner and repository name are required" in a production
  // build. Nuxt applies a layer's `$production` to the consuming app's
  // production build, and `@nuxt/kit` skips a module whose config key is
  // `false`. An app that wants Studio in production sets its own top-level
  // `studio` object, which wins over this `false` (#200).
  $production: {
    studio: false,
  },
  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    'nuxt-galaxy',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    'motion-v/nuxt',
    '@nuxt/content',
    'nuxt-studio',

  ],

  runtimeConfig: {
    public: {
      meilisearch: {
        hostUrl: 'http://localhost:7700', // required
        searchApiKey: 'MASTER_KEY', // required
      },
    },
  },
  supabase: {
    // No `types`: a value here would win over nuxt-galaxy's in every app on
    // the layer. `test/supabaseClient.test-d.ts` checks the client (#196).
    // The sign-in redirects for this layer's pages, with its four public
    // pages; nuxt-galaxy sets none (ADR 0009, #162). Login and confirm read
    // the saved cookie to send the user back to the page they were on.
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      saveRedirectToCookie: true,
      exclude: ['/', '/login', '/signup', '/confirm'],
    },
  },
  css: [
    join(currentDir, './app/assets/css/main.css'),
  ],
  experimental: {
    typedPages: true,
  },
  hooks: {
    'content:file:afterParse': function (ctx: FileAfterParseHook) {
      if (ctx.file.id.startsWith('content/wiki/')) {
        log.debug(`Parsed content: ${ctx.file.id}`)
        const body = ctx.content.body as {
          value: unknown[]
          toc: { links: { depth: number, id: string, text: string }[] }
        }
        const dois = []
        for (const block of body.value) {
          dois.push(...searchContentRef(block))
        }
        const uniqueDois = parseDois(dois)

        if (uniqueDois.length === 0) {
          return
        }

        // Add bibliography section to content
        body.value.push(
          ['bibliography-section', { ':dois': JSON.stringify(uniqueDois) }],
        )
        // Add bibliography section to table of contents
        body.toc.links.push({ depth: 2, text: 'Bibliography', id: 'bibliography' })
      }
    },
  },

  vite: {
    optimizeDeps: {
      // `blendtype` is a workspace package: its `dist` is rebuilt while a dev
      // server runs, and Vite's pre-bundled copy is keyed on dependency
      // metadata rather than on that file's contents, so it goes stale and
      // serves a module missing whatever the rebuild added. Excluded here so
      // dev always reads the real `dist`. Its own dependencies stay in
      // `include` below, which is the pairing Vite documents.
      exclude: ['blendtype'],
      include: [
        '@uwdata/mosaic-core',
        '@uwdata/mosaic-sql',
        'scule',
        '@uwdata/vgplot',
        '@observablehq/plot',
        'd3',
        'htl',
        '@nuxt/content/utils',
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@vueuse/core',
        'zod',
        'jwt-decode',
        'effect',
        '@tanstack/vue-table',
        'zod-validation-error',
        // 'shaders',
        // 'shaders/vue',
      ],
    },
  },
})
