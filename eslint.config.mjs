import antfu from '@antfu/eslint-config'

export default antfu({
  unocss: false,
  vue: true,
  ignores: [
    '**/.agents/**',
    '**/.planning/**',
    'packages/nuxt-galaxy/src/runtime/types/database.ts',
  ],
})
