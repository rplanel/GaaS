import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  extends: [
    '../packages/ui',
  ],
  modules: [
    // '@nuxt/ui',
    '@nuxt/devtools',
    '@nuxt/eslint',
  ],
  compatibilityDate: '2024-11-01',
  future: {
    compatibilityVersion: 4,
  },
  css: [
    join(currentDir, './app/assets/css/main.css'),
  ],
  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },
  vite: {
    server: {
      watch: {
        ignored: ['**/content.config.*'],
      },
    },
    optimizeDeps: {
      exclude: ['@nuxt/content'],
      include: [
        'blendtype',
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'd3-dsv',
        'd3-fetch',
        '@observablehq/plot',
        'apache-arrow',
        '@supabase/supabase-js',
        '@uwdata/mosaic-core',
        '@uwdata/mosaic-sql',
        '@uwdata/vgplot',
      ],
    },
  },
  eslint: {
    config: {
      stylistic: true, // <---
    },
  },
  supabase: {
    // Public pages of this app, on top of @gaas/ui's. The type requires
    // `login` and `callback`, so these repeat the layer's.
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/wiki', '/wiki/**'],
    },
  },
  galaxy: {
    useBlobUpload: true,
  },
})
