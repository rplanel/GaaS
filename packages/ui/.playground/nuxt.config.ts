import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  extends: ['..'],
  modules: ['@nuxt/eslint'],
  future: {
    compatibilityVersion: 4,
  },
  experimental: {
    typedPages: true,
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
  eslint: {
    config: {
      // Use the generated ESLint config for lint root project as well
      rootDir: fileURLToPath(new URL('..', import.meta.url)),
    },
  },
  compatibilityDate: '2025-01-02',
})
