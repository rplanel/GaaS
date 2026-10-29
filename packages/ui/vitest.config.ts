import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  // any custom Vitest config you require
  test: {
    // Use threads pool to avoid forks-pool IPC write failures (errno -122 / EDQUOT)
    // in this runtime environment.
    pool: 'threads',
    environment: 'nuxt',
    hookTimeout: 30000,
    environmentOptions: {
      nuxt: {
        overrides: {
          // The layer's `$production` does not apply under Vitest (`NODE_ENV`
          // is `test`), and without an override the Nuxt environment hits
          // nuxt-studio's missing-repository throw (#200). `false` skips the
          // module.
          studio: false,
        },
      },
    },
  },

})
