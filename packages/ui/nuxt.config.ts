// https://nuxt.com/docs/api/configuration/nuxt-config
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// import { createResolver } from '@nuxt/kit'

// const { resolve } = createResolver(import.meta.url)

const currentDir = dirname(fileURLToPath(import.meta.url))

// import { defineNuxtConfig } from 'nuxt/config'

// const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  // alias: { '@gaas-ui': resolve('./') },
  devtools: { enabled: true },
  $meta: {
    name: '@gaas-ui',
  },
  modules: [
    '@nuxt/ui',
    '@nuxt/test-utils/module',
    '@nuxt/eslint',
    'nuxt-galaxy',
    '@pinia/colada-nuxt',
    '@pinia/nuxt',
  ],

  runtimeConfig: {
    public: {
      meilisearch: {
        hostUrl: 'http://localhost:7700', // required
        searchApiKey: 'MASTER_KEY', // required
      },
    },
  },
  // Supabase types are provided by nuxt-galaxy module
  supabase: {
    types: false, // Disable default type generation, use nuxt-galaxy's types
  },
  css: [
    join(currentDir, './app/assets/css/main.css'),
  ],
  experimental: {
    typedPages: true,
  },

  vite: {
    optimizeDeps: {
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
        '@vueuse/integrations/useJwt',
        '@tanstack/vue-table',
        'zod-validation-error',
      ],
    },
  },
})
