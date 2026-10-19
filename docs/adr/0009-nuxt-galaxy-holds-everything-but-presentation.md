---
status: accepted
date: 2026-10-19
---

# `nuxt-galaxy` holds everything but presentation, proved by a second UI

GaaS ships two packages, `nuxt-galaxy` and `@gaas/ui`. `nuxt-galaxy` is a Nuxt module holding the server, the database, the Galaxy client, composables and queries; `@gaas/ui` is a Nuxt layer built on Nuxt UI. The reason they are two is that anyone should be able to replace Nuxt UI with another UI framework by rewriting `@gaas/ui` and keeping `nuxt-galaxy`. At `3efd0d821a` that promise was only half kept:
- about 4.5k lines of framework-free composables and utils lived in `@gaas/ui`, and so did the logic inside its largest component scripts;
- `nuxt-galaxy` set `@gaas/ui`'s sign-in redirects and declared `@nuxt/content`, which only `@gaas/ui`'s wiki uses;
- `nuxt-galaxy` relied on `@gaas/ui` to register Pinia Colada;
- nothing showed that a swap could work.

We decided that **the line between the two packages is presentation**:

- **The line.** A swap may replace Nuxt UI, Tailwind and the rendering libraries (Vue Flow, Observable Plot), while Nuxt and Vue stay. A file belongs in `nuxt-galaxy` if a plain-HTML Vue UI would need it unchanged. A file that produces markup or decides how something looks (colours, icons, sizes, breakpoints) stays in `@gaas/ui`. A file that does both is split, and sizes the logic needs become parameters.
- **What `nuxt-galaxy` exports.** Composables, queries, utils, route middleware and types. It exports no components, not even headless ones.
- **The proof.** `nuxt-galaxy`'s playground is a second UI. It is plain HTML, imports nothing but `nuxt-galaxy`, and runs sign-in and starting an analysis. CI mounts its pages, and a lint rule stops it importing `@gaas/ui`, Nuxt UI or another layer. If it has to copy code from `@gaas/ui`, a move is missing.
- **Moves are pulled.** Logic moves only when the second UI needs it, one ticket per move. The results-view convention is the one exception: it moves at once (see the amendment to ADR 0003), because every app that adopts it before the move would otherwise have to change its imports later.
- **New code follows the line.** A new file in `@gaas/ui` that imports only from `nuxt-galaxy`, Vue or Nuxt belongs in `nuxt-galaxy`. A new framework-free file that needs something still in `@gaas/ui` stays beside it, and its dependency does not move early on its account.
- **`nuxt-galaxy` installs what it needs, and nothing that only `@gaas/ui` needs.**
  - It registers the `@pinia/nuxt` and `@pinia/colada-nuxt` Nuxt modules.
  - It sets no sign-in redirect options, and keeps the Supabase client's `galaxy` schema.
  - It drops `@nuxt/content`.
  - `@gaas/ui` sets its own login and callback pages, the redirect cookie and its four public pages.
- **`nuxt-galaxy` stays a Nuxt module.**

## Considered options

- **Merging the two packages into one layer.** Rejected on 2026-10-18: replacing the UI framework would then mean forking the merged package. ADR 0008 folded the wiki into `@gaas/ui` because no app wanted one without the other. The same argument does not apply here: a second consumer of `nuxt-galaxy` is the whole point, even before one exists.
- **Drawing the line at HTTP**, so that `nuxt-galaxy` keeps only the server, the database and shared types. Rejected because about 85 auto-imported composables, queries and utils would move into `@gaas/ui`, and every replacement UI would have to rewrite them.
- **Moving all the framework-free logic at once.** Rejected because it pays for moves that no UI uses yet. It also proves nothing about what a UI actually needs, and the second UI does.
- **Turning `nuxt-galaxy` into a Nuxt layer.** Rejected for three reasons:
  - **Setup-time checks would go.** A layer has no setup function, so the typed `galaxy:` options could no longer be validated when the app builds (a bad sync option stops the build today). Installing the logger, mounting the cache and loading the migrations plugin only when asked all read those options.
  - **A build is still needed.** The migrate and seed bins, the package exports and the published types all need one, so the build step would stay.
  - **Every app would change how it installs it.** A replacement UI can use a module or a layer equally well, so the swap gains nothing from the change.
- **Letting Nitro scan the module's server folder**, so the 17 hand-registered routes go. Not taken. It is unverified: the build writes a type declaration next to every handler, and the conditional migrations plugin would have to move out of `plugins/`. The route test of #79 already catches a handler that was never registered. If the hand registrations ever have to go, this is a spike of its own.
- **Headless components in `nuxt-galaxy`.** Rejected because a headless component still fixes the slots and structure that a replacement would want to choose.

## Consequences

- **The sides of logic that has not moved yet are recorded**, so that a later move does not reopen them. Each moves when something pulls it.
  - **Going to `nuxt-galaxy`:**
    - step-state logic and wording;
    - the plain parts of the workflow graph and its dagre layout, with node sizes passed in;
    - the admin route middleware, which would go through the user-role composable and read the login path from config.
  - **Staying in `@gaas/ui`:**
    - the parameter type→component map;
    - navigation;
    - breakpoints;
    - file-type icons;
    - step kinds;
    - anything that names a Nuxt UI colour.
- **Two parts of `@gaas/ui` stay whole, outside the line.** They are the wiki (ADR 0008) and the Meilisearch, Mosaic and plot toolkit, which only downstream apps use. Neither is part of what a swap has to replace.
- **An app built on `nuxt-galaxy` alone gets `@nuxtjs/supabase`'s own redirect defaults.** Nuxt concatenates a module dependency's array defaults, so as long as `nuxt-galaxy` set the four public pages, no app could remove them. An app on `@gaas/ui` keeps `@gaas/ui`'s redirects and can add pages of its own.
- **`@gaas/ui`'s agent instructions carry the rule for new code**, and code review checks it.
- **No new glossary term.** "The Nuxt module" and "the UI layer" stay the names.
- **Revisit trigger**: a replacement that also drops Vue or Nuxt. That would move the line, because the test above assumes both stay.
