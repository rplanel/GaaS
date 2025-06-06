import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  vue: true,
  stylistic: true,
  typescript: true,
  markdown: false,
  ignores: ['docs/content/**/*.md', 'packages/gaas-cli/**/*.ts', 'packages/gaas-cli/**/*.js', 'packages/gaas-cli/**/*.vue', 'packages/gaas-cli/**/*.json', 'packages/gaas-cli/**/*'],
})
