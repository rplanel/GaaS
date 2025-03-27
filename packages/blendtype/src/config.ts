import { Context, Layer } from 'effect'

// const API_KEY = Config.string('API_KEY')
// const GALAXY_URL = Config.string('GALAXY_URL')

export interface BlendTypeConfigImpl {
  apiKey: string
  url: string
}

// export function init(config: BlendTypeConfig) {

//   Context.make
// }

export class BlendTypeConfig extends Context.Tag('@blendtype/Config')<BlendTypeConfig, BlendTypeConfigImpl>() {}

export function makeConfigLayer(config: BlendTypeConfigImpl) {
  return Layer.succeed(BlendTypeConfig, config)
}
