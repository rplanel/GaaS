import { defineConfig } from 'vitest/config'

/**
 * Root Vitest configuration for the GaaS monorepo.
 *
 * This config provides defaults that apply across all packages.
 * Individual packages can override or extend settings by creating
 * their own `vitest.config.ts` file - Vitest merges them automatically.
 *
 * Priority: package config > workspace config > root config
 */
export default defineConfig({
  test: {
    // Exclude directories that should never be tested
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/repos/**', // Other projects' source, linked by `pnpm repos` (ADR 0007)
      '**/.nuxt/**',
      '**/.output/**',
      '**/coverage/**',
      '**/*.d.ts',
    ],
    // Common settings for all packages
    globals: true,
    environment: 'node',
    // Use threads pool to avoid forks-pool IPC write failures (errno -122 / EDQUOT)
    // in this runtime environment.
    pool: 'threads',
  },
})
