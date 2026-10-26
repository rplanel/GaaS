import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { resolvePath } from '@nuxt/kit'
import { beforeAll, describe, expect, it } from 'vitest'
import { withFixtureNuxt } from './loadFixture'

type NuxtOptions = Parameters<Parameters<typeof withFixtureNuxt>[0]>[0]

/** Every module that ran, by the package it was loaded from. */
function installedModules(options: NuxtOptions) {
  return options._installedModules.map(({ entryPath, meta }) => entryPath ?? meta.name)
}

/** The `supabase` key, which Nuxt's own option types do not declare. */
function supabaseOptions(options: NuxtOptions) {
  return (options as unknown as { supabase: Record<string, unknown> }).supabase
}

type TemplateData = Parameters<NonNullable<NuxtOptions['build']['templates'][number]['getContents']>>[0]

/** What `@nuxtjs/supabase` writes to `.nuxt/types/supabase-database.d.ts`. */
async function supabaseDatabaseTypes(options: NuxtOptions) {
  const template = options.build.templates.find(({ filename }) => filename === 'types/supabase-database.d.ts')
  // It reads nothing it is handed.
  return template?.getContents?.({} as TemplateData)
}

/**
 * What the module installs, and what it sets for the modules it installs, in
 * an app built on `nuxt-galaxy` alone. The fixture is such an app: it lists
 * this module and nothing else. `src/module.ts` says why each one is or is
 * not there (ADR 0009, #162).
 */
async function loadResolvedConfig() {
  return withFixtureNuxt(async options => ({
    // The `supabase` key as the app and the module dependencies left it.
    // `@nuxtjs/supabase` applies its own defaults to the options it is
    // handed, not to this key, so anything here came from them.
    supabase: supabaseOptions(options),
    // What the app runs with: `@nuxtjs/supabase` copies the merged options
    // here, and its redirect plugin reads them from here.
    redirectOptions: options.runtimeConfig.public.supabase.redirectOptions,
    installed: installedModules(options),
    // The extensions `@nuxtjs/supabase` resolves its `types` path with.
    extensions: options.extensions,
    databaseTypes: await supabaseDatabaseTypes(options),
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

  it('has @nuxtjs/supabase type the client with nuxt-galaxy\'s database types', () => {
    expect(resolved.databaseTypes).toMatch(/^export \* from '(?:\.\.\/)+src\/runtime\/types\/database\.ts'$/)
  })

  // The build turns `runtime/types/database.ts` into `database.js` and
  // `database.d.ts` and ships no `.ts`, so a path naming the `.ts` resolves
  // in this workspace and in no app that installs the module (#193).
  it('names its database types so that they resolve in the packed module', async () => {
    const shipped = await mkdtemp(join(tmpdir(), 'nuxt-galaxy-types-'))
    try {
      await writeFile(join(shipped, 'database.js'), '')
      await writeFile(join(shipped, 'database.d.ts'), '')
      const typesPath = join(shipped, basename(String(resolved.supabase.types)))

      expect(await resolvePath(typesPath, { extensions: resolved.extensions })).toBe(join(shipped, 'database.js'))
    }
    finally {
      await rm(shipped, { recursive: true, force: true })
    }
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

describe('an app that sets @nuxtjs/supabase\'s database types itself', () => {
  // The app sets `false`, which leaves the client untyped, and nuxt-galaxy's
  // default does not replace it.
  it('keeps its own', async () => {
    const { types, databaseTypes } = await withFixtureNuxt(async options => ({
      types: supabaseOptions(options).types,
      databaseTypes: await supabaseDatabaseTypes(options),
    }), { supabase: { types: false } })

    expect(types).toBe(false)
    expect(databaseTypes).toBe('export type Database = unknown')
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
