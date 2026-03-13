import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
  ],
  declaration: true,
  clean: true,
  failOnWarn: false,
  externals: ['tus-js-client'],
  rollup: {
    emitCJS: true,
    commonjs: false,
    dts: { respectExternal: true },
  },
})
