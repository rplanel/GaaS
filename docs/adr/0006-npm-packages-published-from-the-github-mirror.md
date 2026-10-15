---
status: accepted
date: 2026-10-15
---

# The npm packages are published from the GitHub mirror through trusted publishing

A package release used to end with `pnpm release` publishing `blendtype`, `nuxt-galaxy`, `@gaas/ui` and `@gaas/wiki` to npm from the maintainer's machine. npm asks for two-factor authentication on every upload, and here that is a passkey kept in a password vault, so there is no code to hand to `--otp`. npm answers the challenge only when it has a terminal: pnpm's recursive run gives it none, so `0.0.4-beta.4` failed after its tag had been pushed, and the four packages had to be published one at a time, each waiting on the passkey.

We decided that **the four packages are published to npm by a GitHub Actions workflow on the GitHub mirror, `rplanel/gaas`, through npm's trusted publishing**. The workflow authenticates with an OIDC token, so no npm token or passkey is involved. The version bump stays on the maintainer's machine. `pnpm release` and `pnpm release:beta` run the gates, bump, tag, and push to GitLab first. They push to GitHub only once GitLab has accepted, and they wait for the workflow to report. The workflow runs on a `v*` tag in a GitHub environment, `npm`, that admits only `v*` tags, and npm trusts it under that name. It refuses a tag that does not match every package's version, and a prerelease that is not a beta. It publishes a beta to `beta` and anything else to `latest`. Once a package release has gone out this way, each package is set to require two-factor authentication and disallow tokens.

GitLab stays where the code, the merge requests and the CI live. The mirror is only where npm will take the upload from.

## Considered options

These were checked against npm's documentation on 2026-10-15.

- **Trusted publishing from GitLab CI on gitlab.pasteur.fr**: impossible. npm trusts GitHub Actions on GitHub-hosted runners, GitLab.com shared runners and CircleCI cloud only. Self-hosted runners are "planned", with no date. Revisit trigger: npm supports self-managed GitLab, and then the workflow moves home and the mirror stops being load-bearing.
- **A bypass-2FA granular token in GitLab CI**: rejected. It works today, but "the ability to publish new package versions directly with a granular access token will be removed in January 2027", three months out. It is also a secret that expires.
- **A stage-only token, with each staged release approved on npmjs.com**: rejected. It survives 2027 and stays on GitLab, but every package release still waits on a human click, and that click is the thing being removed.
- **Publishing by hand, one package at a time**: kept as the fallback rather than the path. Each package's `release:publish` and `release:publish:beta` are run one package at a time, in a terminal, so npm can wait on the passkey.

## Consequences

- **The push order is load-bearing.** `git push all` pushes to GitHub first, because that is the order of its push URLs in the local git config. If GitLab then refused the push (an MR merged while the gates ran is enough), GitHub would publish a release GitLab never received. The release scripts therefore push to `origin`, then to `github`, and a release tag never goes through `all`. The workflow cannot check GitLab for itself, because the project is internal and that would need a GitLab token on GitHub.
- **Publishing does not wait for GitLab's pipeline** on the release commit, as it did not before. The gate before an upload is `release:check` on the maintainer's machine.
- **Every package's `repository.url` names the GitHub mirror**, because npm refuses a trusted publish whose repository does not match. npm therefore links the packages to the mirror, and provenance records which workflow built each one.
- **The mirror's own CI is gone.** Its stale `ci.yml` would have run on every release push, and GitLab is the CI.
- **With tokens disallowed, a leaked npm token cannot publish anything.** Trusted publishing and an interactive two-factor publish still can.
