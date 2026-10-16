import type { TestContext } from 'node:test'
import type { Project } from './repos.mts'
import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { linkRepos, packageVersionOf, PROJECTS, refsFor } from './repos.mts'

function project(dir: string): Project {
  const found = PROJECTS.find(candidate => candidate.dir === dir)
  assert.ok(found, dir)
  return found
}

/** An empty directory, removed when the test ends. */
function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'gaas-repos-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A checkout holding `lockfile`, and a cache holding the downloads named. */
function machine(t: TestContext, lockfile: string, downloads: string[]): { checkout: string, cache: string } {
  const root = scratch(t)
  const checkout = join(root, 'checkout')
  const cache = join(root, 'cache')
  mkdirSync(checkout)
  writeFileSync(join(checkout, 'pnpm-lock.yaml'), lockfile)
  for (const download of downloads) {
    mkdirSync(join(cache, download), { recursive: true })
    writeFileSync(join(cache, download, 'README.md'), download)
  }
  return { checkout, cache }
}

// The shape pnpm 10 writes: a catalog per `pnpm-workspace.yaml` catalog, then
// one `packages` entry per installed package version, peer suffixes only in
// `snapshots`.
const LOCKFILE = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

catalogs:
  default:
    drizzle-orm:
      specifier: ^1.0.0-beta.16
      version: 1.0.0-rc.4-de6c356
    zod:
      specifier: ^4.3.6
      version: 4.4.3
  nuxt:
    '@nuxt/ui':
      specifier: ^4.6.1
      version: 4.10.0

importers:

  .:
    devDependencies:
      zod:
        specifier: 'catalog:'
        version: 4.4.3

packages:

  '@nuxt/ui@4.10.0':
    resolution: {integrity: sha512-a}

  '@supabase/supabase-js@2.110.8':
    resolution: {integrity: sha512-b}

  drizzle-orm@1.0.0-rc.4-de6c356:
    resolution: {integrity: sha512-c}

  zod@3.25.76:
    resolution: {integrity: sha512-d}

  zod@4.4.3:
    resolution: {integrity: sha512-e}

snapshots:

  '@nuxt/ui@4.10.0(25652042066169ea2f4bd3f0261da170)':
    dependencies: {}
`

describe('packageVersionOf', () => {
  it('takes the package version a catalog resolves to, when several are installed', () => {
    // zod 3.25.76 comes in through other packages; GaaS's catalog says 4.
    assert.equal(packageVersionOf(LOCKFILE, 'zod'), '4.4.3')
  })

  it('keeps the commit a pre-release build\'s package version ends with', () => {
    // Without -de6c356, pnpm repos would download the v1.0.0-rc.4 tag, which
    // exists and is another build.
    assert.equal(packageVersionOf(LOCKFILE, 'drizzle-orm'), '1.0.0-rc.4-de6c356')
  })

  it('takes the only installed package version of a package no catalog names', () => {
    // supabase-js comes in through @nuxtjs/supabase.
    assert.equal(packageVersionOf(LOCKFILE, '@supabase/supabase-js'), '2.110.8')
  })

  it('refuses to guess between installed package versions no catalog decides', () => {
    const uncatalogued = LOCKFILE.replace('    zod:\n      specifier: ^4.3.6\n      version: 4.4.3\n', '')
    assert.throws(() => packageVersionOf(uncatalogued, 'zod'), /zod .*3\.25\.76, 4\.4\.3/)
  })

  it('refuses a package that is not installed', () => {
    assert.throws(() => packageVersionOf(LOCKFILE, 'd3-zoom'), /d3-zoom/)
  })

  it('refuses a lockfile format it was not written for, rather than misread it', () => {
    const next = LOCKFILE.replace(`lockfileVersion: '9.0'`, `lockfileVersion: '10.0'`)
    assert.throws(() => packageVersionOf(next, 'zod'), /10\.0/)
  })
})

describe('PROJECTS', () => {
  it('each resolve to one bare package version in GaaS\'s own lockfile', () => {
    // A project GaaS stops installing, or installs twice outside a catalog,
    // fails here rather than in someone's `pnpm install`.
    const lockfile = readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8')
    for (const project of PROJECTS) {
      assert.match(packageVersionOf(lockfile, project.package), /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, project.package)
    }
  })
})

describe('refsFor', () => {
  it('names the tag in each project\'s own pattern', () => {
    // Effect's monorepo tags each package, so effect 3.22.0 is effect@3.22.0.
    assert.deepEqual(refsFor(project('effect'), '3.22.0'), ['refs/tags/effect@3.22.0'])
    assert.deepEqual(refsFor(project('zod'), '4.4.3'), ['refs/tags/v4.4.3'])
  })

  it('falls back to the commit a pre-release build names, which has no tag', () => {
    // drizzle-orm publishes builds of a commit: v1.0.0-rc.4 is tagged,
    // 1.0.0-rc.4-de6c356 is not.
    assert.deepEqual(refsFor(project('drizzle-orm'), '1.0.0-rc.4-de6c356'), ['refs/tags/v1.0.0-rc.4-de6c356', 'de6c356'])
  })

  it('has no fallback for a package version that names no commit', () => {
    assert.deepEqual(refsFor(project('drizzle-orm'), '1.0.0-beta.16'), ['refs/tags/v1.0.0-beta.16'])
  })
})

describe('linkRepos', () => {
  const ZOD = [project('zod')]

  it('links a project downloaded at the package version the lockfile names', (t) => {
    const { checkout, cache } = machine(t, LOCKFILE, ['zod@3.25.76', 'zod@4.4.3'])

    const [zod] = linkRepos(checkout, cache, ZOD)

    assert.equal(zod?.state, 'linked')
    assert.equal(readFileSync(join(checkout, 'repos/zod/README.md'), 'utf8'), 'zod@4.4.3')
  })

  it('links nothing for a project not downloaded at that package version', (t) => {
    const { checkout, cache } = machine(t, LOCKFILE, ['zod@3.25.76'])

    const [zod] = linkRepos(checkout, cache, ZOD)

    assert.equal(zod?.state, 'not downloaded')
    assert.equal(lstatSync(join(checkout, 'repos/zod'), { throwIfNoEntry: false }), undefined)
  })

  it('relinks a project to the package version the lockfile names now', (t) => {
    const { checkout, cache } = machine(t, LOCKFILE, ['zod@3.25.76', 'zod@4.4.3'])
    mkdirSync(join(checkout, 'repos'))
    symlinkSync(join(cache, 'zod@3.25.76'), join(checkout, 'repos/zod'))

    const [zod] = linkRepos(checkout, cache, ZOD)

    assert.equal(zod?.state, 'linked')
    assert.equal(readlinkSync(join(checkout, 'repos/zod')), join(cache, 'zod@4.4.3'))
  })

  it('drops a link to another package version rather than show the wrong source', (t) => {
    const { checkout, cache } = machine(t, LOCKFILE, ['zod@3.25.76'])
    mkdirSync(join(checkout, 'repos'))
    symlinkSync(join(cache, 'zod@3.25.76'), join(checkout, 'repos/zod'))

    const [zod] = linkRepos(checkout, cache, ZOD)

    assert.equal(zod?.state, 'not downloaded')
    assert.equal(lstatSync(join(checkout, 'repos/zod'), { throwIfNoEntry: false }), undefined)
  })

  it('leaves a real directory where the link would go as it is', (t) => {
    // Files someone put there, or left behind by a checkout from before.
    const { checkout, cache } = machine(t, LOCKFILE, ['zod@4.4.3'])
    mkdirSync(join(checkout, 'repos/zod'), { recursive: true })
    writeFileSync(join(checkout, 'repos/zod/notes.md'), 'mine')

    const [zod] = linkRepos(checkout, cache, ZOD)

    assert.equal(zod?.state, 'in the way')
    assert.equal(readFileSync(join(checkout, 'repos/zod/notes.md'), 'utf8'), 'mine')
  })

  it('reports a project the lockfile does not settle, and links the others', (t) => {
    const { checkout, cache } = machine(t, LOCKFILE, ['zod@4.4.3'])

    const [d3, zod] = linkRepos(checkout, cache, [project('d3-selection'), ...ZOD])

    assert.deepEqual(d3, { project: project('d3-selection'), state: 'unresolved', reason: 'd3-selection is not in pnpm-lock.yaml' })
    assert.equal(zod?.state, 'linked')
  })
})
