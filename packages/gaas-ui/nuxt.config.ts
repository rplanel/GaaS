// import { dirname, join } from 'node:path'
// import { fileURLToPath } from 'node:url'
// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from 'nuxt/config'

// const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui-pro',
    '@nuxt/test-utils/module',
    'nuxt-galaxy',
  ],
  css: ['../app/assets/css/main.css', './app/assets/css/main.css'],
  future: {
    compatibilityVersion: 4,
  },
  experimental: {
    typedPages: true,
  },
  vite: {
    optimizeDeps: {
      include: ['@vueuse/core', '@nuxt/ui-pro', 'zod', 'jwt-decode', 'effect'],
    },
  },

})
