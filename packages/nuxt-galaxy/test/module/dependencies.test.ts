import { beforeAll, describe, expect, it } from 'vitest'
import { withFixtureNuxt } from './loadFixture'

type NuxtOptions = Parameters<Parameters<typeof withFixtureNuxt>[0]>[0]

/** Every module that ran, by the package it was loaded from. */
function installedModules(options: NuxtOptions) {
  return options._installedModules.map(({ entryPath, meta }) => entryPath ?? meta.name)
}

/**
 * What the module installs, and what it sets for the modules it installs, in
 * an app built on `nuxt-galaxy` alone. The fixture is such an app: it lists
 * this module and nothing else (ADR 0009, #162).
 */
async function loadResolvedConfig() {
  return withFixtureNuxt(options => ({
    // The `supabase` key as the app and the module dependencies left it.
    // `@nuxtjs/supabase` applies its own defaults to the options it is
    // handed, not to this key, so anything here came from them.
    supabase: (options as unknown as { supabase: Record<string, unknown> }).supabase,
    // What the app runs with: `@nuxtjs/supabase` copies the merged options
    // here, and its redirect plugin reads them from here.
    redirectOptions: options.runtimeConfig.public.supabase.redirectOptions,
    installed: installedModules(options),
  }))
}

describe('the modules nuxt-galaxy installs', () => {
  let resolved: Awaited<ReturnType<typeof loadResolvedConfig>>

  beforeAll(async () => {
    resolved = await loadResolvedConfig()
  })

  it('sets no sign-in redirect options, so the app gets @nuxtjs/supabase\'s own', () => {
    // Nuxt concatenates a module dependency's array defaults with the app's,
    // so an exemption set here is one no app could remove. The sign-in pages
    // and their exemptions are the UI layer's to choose.
    expect(resolved.supabase.redirectOptions).toBeUndefined()
    expect(resolved.redirectOptions.exclude).toEqual([])
    expect(resolved.redirectOptions.saveRedirectToCookie).toBe(false)
  })

  it('keeps the Supabase client on the galaxy schema', () => {
    expect(resolved.supabase.clientOptions).toEqual({ db: { schema: 'galaxy' } })
  })

  it('installs @nuxtjs/supabase', () => {
    expect(resolved.installed).toContain('@nuxtjs/supabase')
  })

  it('does not install @nuxt/content, which nothing in it reads', () => {
    // Only the UI layer's wiki reads content (ADR 0008), and the layer
    // registers it itself. Installed from here, every app on the module
    // alone carried a content database it never read.
    expect(resolved.installed).not.toContain('@nuxt/content')
  })

  it('installs Pinia and Pinia Colada, which its queries run on', () => {
    // The queries under `runtime/app/queries` are Pinia Colada query options.
    // They ran only because the UI layer happened to register both modules,
    // and an app on the module alone had no Colada plugin to run them.
    expect(resolved.installed).toContain('@pinia/nuxt')
    expect(resolved.installed).toContain('@pinia/colada-nuxt')
  })
})

describe('an app that lists the Pinia modules itself', () => {
  it('loads, and runs each of them once', async () => {
    // The UI layer is such an app. Nuxt skips a dependency the app already
    // lists, so the module adds nothing to it.
    const installed = await withFixtureNuxt(installedModules, {
      modules: ['@pinia/nuxt', '@pinia/colada-nuxt'],
    })

    expect(installed.filter(name => name === '@pinia/nuxt')).toHaveLength(1)
    expect(installed.filter(name => name === '@pinia/colada-nuxt')).toHaveLength(1)
  })
})
