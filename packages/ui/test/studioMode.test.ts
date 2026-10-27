// @vitest-environment node

/**
 * The layer leaves nuxt-studio out of a production build (#200).
 *
 * nuxt-studio 1.7.0 throws "Repository owner and repository name are
 * required" in a production build that names no repository, and the docs
 * promise Studio in dev only. The layer therefore sets
 * `$production: { studio: false }` in its `nuxt.config.ts`: Nuxt applies a
 * layer's `$production` to the consuming app's production build, and
 * `@nuxt/kit` skips a module whose config key is `false`. In dev the key is
 * left unset, so the module loads as before. An app that wants Studio in
 * production sets its own top-level `studio` object, which wins over the
 * layer's `false`.
 *
 * Read through `loadNuxtConfig` on `.playground` — an app on the layer —
 * loaded for each environment the way `nuxi build` and `nuxi dev` load it.
 */

import { fileURLToPath } from 'node:url'
import { loadNuxtConfig } from 'nuxt/kit'
import { describe, expect, it } from 'vitest'

const playgroundDir = fileURLToPath(new URL('../.playground', import.meta.url))

describe('the UI layer\'s Studio setting', () => {
  it('is off when an app on the layer is loaded for a production build', { timeout: 120_000 }, async () => {
    const config = await loadNuxtConfig({ cwd: playgroundDir, envName: 'production' })
    expect(config.studio).toBe(false)
  })

  it('is left on when an app on the layer is loaded for development', { timeout: 120_000 }, async () => {
    const config = await loadNuxtConfig({ cwd: playgroundDir, envName: 'development' })
    expect(config.studio).not.toBe(false)
  })
})
