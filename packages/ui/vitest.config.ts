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
          studio: {
            repository: {
              owner: 'gaas',
              repo: 'GaaS',
              provider: 'gitlab',
            },
          },
        },
      },
    },
  },

})
