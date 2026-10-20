import antfu from '@antfu/eslint-config'

export default antfu({
  unocss: false,
  vue: true,
  ignores: [
    '**/.agents/**',
    'packages/nuxt-galaxy/src/runtime/types/database.ts',
  ],
}, {
  // The scripts under scripts/ are plain Node, and their tests use Node's own
  // runner. The root declares no test framework, and vitest reaches the root
  // only through the hoist, which an install can change under it (#81).
  files: ['scripts/*/**/*.test.mts'],
  rules: {
    'test/no-import-node-test': 'off',
  },
}, {
  // nuxt-galaxy's playground is the second UI, which proves a plain-HTML UI
  // needs nothing but nuxt-galaxy (ADR 0009). The workspace hoists @gaas/ui
  // and @nuxt/ui, so these imports would resolve there without this rule.
  // It sees static imports only; nuxt-galaxy's AGENTS.md lists what it misses.
  files: ['packages/nuxt-galaxy/playground/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        regex: '^(?:@gaas/ui|@nuxt/ui|#layers)(?:/|$)',
        message: 'The playground is plain HTML on nuxt-galaxy alone (ADR 0009). Logic it needs from @gaas/ui moves to nuxt-galaxy in a ticket of its own; markup is written here.',
      }],
    }],
  },
})
