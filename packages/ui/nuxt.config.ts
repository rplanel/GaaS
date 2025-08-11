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
  // $meta: {
  //   name: '@gaas-ui',
  // },
  modules: [
    '@nuxt/ui-pro',
    '@nuxt/test-utils/module',
    '@nuxt/eslint',
    'nuxt-galaxy',
  ],
  css: [
    join(currentDir, './app/assets/css/main.css'),
  ],
  experimental: {
    typedPages: true,
  },
  vite: {
    optimizeDeps: {
      include: [
        '@vueuse/core',
        '@nuxt/ui-pro',
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
