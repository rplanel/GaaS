import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          // Use threads pool to avoid forks-pool IPC write failures (errno -122 / EDQUOT)
          // in this runtime environment.
          pool: 'threads',
          environment: 'node',
          include: ['test/unit/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/.nuxt/**', '**/.playground/**'],
        },
      },
      {
        test: {
          name: 'nuxt',
          // Use threads pool to avoid forks-pool IPC write failures (errno -122 / EDQUOT)
          // in this runtime environment.
          pool: 'threads',
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
