---
status: accepted
date: 2026-10-16
---

# The wiki is part of `@gaas/ui`

`@gaas/wiki` was a Nuxt layer of its own that extended `@gaas/ui`. It added the `/wiki` pages and their layouts, DOI citations with a bibliography appended to each page, the `content` and `bibliography` collections, and an `app.vue` with content search. Every app built on GaaS extended the wiki: the repository's playground, satellite-finder and defensefinder. Only ui's own `.playground` extended `@gaas/ui` alone. The second package still cost a `package.json` repeating eleven dependencies, its own gates in CI, an npm name, a docs section and a second `app.vue`, and that copy had drifted: it dropped ui's `twitter:card`, `og:site_name` and site-name title template from every app.

We decided that **the wiki is part of `@gaas/ui`**. Its files move into ui's `app/` with no flag, so every app on ui serves `/wiki` and shows the Wiki menu link. One `app.vue` keeps ui's SEO tags and the wiki's search and navigation. The package keeps the name `@gaas/ui`. `@gaas/wiki` is deprecated on npm after the first release without it, with no last version that only extends ui.

## Considered options

- **Keep the boundary.** Rejected because it pays the second package's costs for an app that extends ui without the wiki, and none exists.
- **Reverse it, so the wiki does not extend ui.** Rejected because it would serve a site with wiki pages and citations but no Galaxy, which nobody runs, and the wiki's `app.vue` reads ui's navigation menu, so it would be a rewrite rather than a move.
- **A local module inside ui that adds the wiki behind a flag**, the shape of `modules/results-views`. Rejected for now: no app wants the wiki off, and a module adding a route named like an app's own `pages/wiki/[...slug].vue` would replace the app's route. **Revisit trigger**: an app that wants no wiki. Moving the files into such a module is then a move, not a rewrite, and the module must skip a route the app already declares.
- **A last `@gaas/wiki` release that only extends `@gaas/ui`.** Rejected because neither downstream app installs `@gaas/wiki` from npm (both are pinned to pkg.pr.new builds), and both have to edit `package.json` when they upgrade anyway. The shim would also take a release of its own and a second change to drop the package from the version files.
- **Renaming `@gaas/ui`.** Rejected because "UI" still describes a layer of pages, and a rename would touch the `#layers/@gaas/ui` imports (keyed on `$meta.name`), the `#gaas/ui` alias of ADR 0003, the docs, the release scripts and npm's trusted publishing, all for a better word.

## Consequences

- **An app still declares its own collections.** @nuxt/content resolves a layer's collection against that layer's own `content/` directory, so ui's `content`, `landing` and `bibliography` stay empty placeholders until an app declares the same names, which replace them whole. The wiki's collection keeps the name `content`: renaming it would leave an app's own `content` declaration read by nothing, and its wiki empty with no error.
- **The release that confirmed #148 published four packages.** The move ships in the following beta, and `npm deprecate @gaas/wiki` is then run by hand with the maintainer's passkey, because trusted publishing does not cover deprecation.
- **An app moving off `@gaas/wiki`** replaces it with `@gaas/ui` in `package.json` and in `extends`. Neither downstream app's code names `@gaas/wiki` anywhere else.
