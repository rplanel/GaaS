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
 * this module and nothing else. `src/module.ts` says why each one is or is
 * not there (ADR 0009, #162).
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
    expect(resolved.installed).not.toContain('@nuxt/content')
  })

  it('installs Pinia and Pinia Colada, which its queries run on', () => {
    expect(resolved.installed).toContain('@pinia/nuxt')
    expect(resolved.installed).toContain('@pinia/colada-nuxt')
  })
})

function timesInstalled(installed: ReturnType<typeof installedModules>, name: string) {
  return installed.filter(entry => entry === name).length
}

describe('an app that lists a Pinia module itself, after nuxt-galaxy', () => {
  it.each([
    { lists: '@pinia/nuxt alone', modules: ['@pinia/nuxt'] },
    { lists: '@pinia/colada-nuxt alone', modules: ['@pinia/colada-nuxt'] },
    // the order @gaas/ui's nuxt.config lists them in
    { lists: 'both', modules: ['@pinia/nuxt', '@pinia/colada-nuxt'] },
  ])('loads, and runs each Pinia module once, when it lists $lists', async ({ modules }) => {
    const installed = await withFixtureNuxt(installedModules, { modules })

    expect(timesInstalled(installed, '@pinia/nuxt')).toBe(1)
    expect(timesInstalled(installed, '@pinia/colada-nuxt')).toBe(1)
  })
})
