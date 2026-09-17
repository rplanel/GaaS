import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // Use threads pool to avoid forks-pool IPC write failures (errno -122 / EDQUOT)
    // in this runtime environment.
    pool: 'threads',
    environment: 'nuxt',
    include: ['test/**/*.test.ts'],
    exclude: ['test/server/**'],
    environmentOptions: {
      nuxt: {
        rootDir: './test/fixtures/basic',
        overrides: {
          modules: ['../../../src/module'],
        },
      },
    },
    setupFiles: ['./test/setup.ts'],
  },
})
