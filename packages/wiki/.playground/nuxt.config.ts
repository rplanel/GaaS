import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
export default defineNuxtConfig({
  extends: [
    // '../../ui',
    '..',
  ],
  modules: [
    '@nuxt/content',
    '@nuxt/eslint',
    '@nuxt/devtools',

  ],
  future: {
    compatibilityVersion: 4,
  },
  css: [
    join(currentDir, './app/assets/css/main.css'),
  ],
  eslint: {
    config: {
      // Use the generated ESLint config for lint root project as well
      rootDir: fileURLToPath(new URL('..', import.meta.url)),
    },
  },

  compatibilityDate: '2025-04-25',
})
