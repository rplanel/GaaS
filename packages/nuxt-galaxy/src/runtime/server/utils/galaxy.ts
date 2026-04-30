import type { GalaxyFetch } from 'blendtype'
import type { Layer } from 'effect'
import { useRuntimeConfig } from '#imports'
import { makeGalaxyLayer } from 'blendtype'

let _galaxyLayer: Layer.Layer<GalaxyFetch> | null = null

/**
 * Returns the GalaxyFetch layer built from runtime config.
 *
 * The layer is created once (lazy singleton) and reused across all requests.
 * This replaces the old `initializeGalaxyClient()` + `runWithConfig()` pattern.
 */
export function useGalaxyLayer(): Layer.Layer<GalaxyFetch> {
  if (!_galaxyLayer) {
    const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
    _galaxyLayer = makeGalaxyLayer({ apiKey, url })
  }
  return _galaxyLayer
}
