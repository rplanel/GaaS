/**
 * Link `repos/` to the shared download on every `pnpm install` (ADR 0007).
 *
 * Plain JavaScript, and `repos.mts` imported only past the CI check, on
 * purpose: `deploy:docs` runs `pnpm install` on Node 22.16, which cannot run
 * `.mts`. It never downloads, and it never fails the install: what is not
 * downloaded is reported, and `pnpm repos` downloads it.
 */

import process from 'node:process'

if (!process.env.CI) {
  try {
    const { cacheDir, describeLinks, linkRepos } = await import('./repos.mts')
    process.stdout.write(describeLinks(linkRepos(process.cwd(), cacheDir())))
  }
  catch (error) {
    process.stderr.write(`repos/ was not linked: ${error.message}\n`)
  }
}
