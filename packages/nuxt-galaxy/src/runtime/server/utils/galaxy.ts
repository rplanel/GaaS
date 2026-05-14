import { useRuntimeConfig } from '#imports'
import { makeGalaxyLayer } from 'blendtype'

let _galaxyLayer: ReturnType<typeof makeGalaxyLayer> | null = null

/**
 * Returns the GalaxyFetch layer built from runtime config.
 *
 * The layer is created once (lazy singleton) and reused across all requests.
 * This replaces the old `initializeGalaxyClient()` + `runWithConfig()` pattern.
 */
export function useGalaxyLayer(): ReturnType<typeof makeGalaxyLayer> {
  if (!_galaxyLayer) {
    const { public: { galaxy: { url } }, galaxy: { apiKey } } = useRuntimeConfig()
    _galaxyLayer = makeGalaxyLayer({ apiKey, url })
  }
  return _galaxyLayer
}
