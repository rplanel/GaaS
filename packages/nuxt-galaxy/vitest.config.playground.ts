import { defineVitestConfig } from '@nuxt/test-utils/config'

// Mounts the playground's pages in the playground app. The Nuxt test
// environment boots one app per configuration, and `vitest.config.ts` boots
// the module's fixture, so the playground needs its own. The environment
// reads the tracked `playground/.env.test`.
export default defineVitestConfig({
  test: {
    // Use threads pool to avoid forks-pool IPC write failures (errno -122 / EDQUOT)
    // in this runtime environment.
    pool: 'threads',
    environment: 'nuxt',
    include: ['playground/test/**/*.test.ts'],
    environmentOptions: {
      nuxt: {
        rootDir: './playground',
      },
    },
  },
})
