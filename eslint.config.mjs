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
})
