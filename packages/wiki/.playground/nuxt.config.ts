import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
export default defineNuxtConfig({
  extends: [
    '../../ui',
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

  typescript: {
    // Nuxt's generated `include` covers `test/nuxt/` only, which leaves the
    // layer's own `test/` out of `pnpm typecheck`. Appending to `tsConfig`
    // extends that list instead of replacing it, so auto-imports and
    // component resolution keep working.
    tsConfig: {
      include: [fileURLToPath(new URL('../test/**/*', import.meta.url))],
    },
  },

  compatibilityDate: '2025-04-25',
})
