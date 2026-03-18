import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
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
