import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/.nuxt/**', '**/.playground/**'],
        },
      },
      {
        test: {
          name: 'nuxt',
          environment: 'nuxt',
          include: ['test/nuxt/**/*.test.ts'],
          environmentOptions: {
            nuxt: {
              overrides: {
                modules: [
                  '@nuxt/ui',
                  '@nuxt/test-utils/module',
                  '@nuxt/eslint',
                  '@nuxt/content',
                ],
              },
            },
          },
        },
      },
    ],
  },
})
