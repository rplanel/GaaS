import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use threads pool to avoid forks-pool IPC write failures (errno -122 / EDQUOT)
    // in this runtime environment.
    pool: 'threads',
    environment: 'node',
    include: [
      'test/server/**/*.test.ts',
    ],
    setupFiles: ['./test/server/setup.ts'],
  },
})
