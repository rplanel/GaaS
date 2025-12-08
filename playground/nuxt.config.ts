// https://nuxt.com/docs/api/configuration/nuxt-config
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  extends: [
    // '../packages/ui',
    '../packages/wiki',
  ],
  modules: [
    '@nuxt/ui',
    '@nuxt/devtools',
    '@nuxt/content',
  ],
  compatibilityDate: '2024-11-01',
  future: {
    compatibilityVersion: 4,
  },
  css: [
    join(currentDir, './app/assets/css/main.css'),
  ],
  devtools: { enabled: true },
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

})
