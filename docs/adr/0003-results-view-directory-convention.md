---
status: accepted
date: 2026-09-22
---

# Results views are found by directory, not by component name

A web service built on `@gaas/ui` writes one Vue component per workflow version to display an analysis's results, and GaaS has to find that component from the workflow the analysis ran. The mechanism this replaces derived a slug from the workflow's `name:` and `version:` tags on the server, turned the slug into a PascalCase component name in the browser, and looked the name up at runtime with `resolveComponent`, which forced every such file to be a `.global.vue`. We decided that a small Nuxt module shipped inside the `@gaas/ui` layer scans every layer at build time for `app/workflows/<name>/<version>/results.vue` and generates a lazily imported registry keyed by the directory names verbatim, matched against the `name_key` and `version_key` columns with no transformation on either side. Lookup falls back from the exact version to `app/workflows/<name>/results.vue`, then `app/workflows/results.vue`, then the generic results view GaaS ships.

The two transformations were lossy. Stripping dots made `1.10`, `11.0` and `110` one component, and `0.11` the same as `0.1.1`. Lowercasing the name meant a `satelliteFinder` tag had to be spelled `Satellitefinder` in the file name, and a misspelling fell silently to the generic view. Directory names carry the identity exactly as tagged, so nothing can collide, the registry is typed, code splitting comes from the dynamic import, and the `.global.vue` suffix is no longer part of the contract.

## Considered options

- **Keep the runtime name convention and fix the mangling.** Nuxt registers global components lazily, so bundle size was never the problem. Rejected because it stays a runtime string lookup: exact casing is a trap, the compiler cannot check anything, the props are untyped, and the server and client sanitizers have to agree forever. The existing UI test proved that last point by importing the server helper across packages.
- **An explicit registry written by the developer**, such as `defineWorkflowViews({ satelliteFinder: { '0.11': () => import('...') } })` in a plugin. Typed, about thirty lines to implement, and the honest cheaper alternative. Rejected because it is boilerplate per workflow and an API to learn, where Nuxt developers already think in `pages/` and `components/` conventions.
- **Consumer Nuxt pages**, which would put the workflow identity in the URL. Rejected because the workflow is a property of the analysis, so `/analyses/:id/results` already says enough, and every existing link would change.
- **Identify workflows by Galaxy id or by revision UUID instead of tags.** Rejected because a stored-workflow id is a per-instance encoded id that means nothing in source code, and a revision UUID changes on every save in the Galaxy editor. Tags are written into the `.ga` export and re-applied on import, so the convention survives moving a workflow between Galaxy instances.

## Consequences

- A tag value has to be a legal directory name. Activation refuses a `name:` or `version:` value that does not match `^[A-Za-z0-9][A-Za-z0-9._-]*$`, naming the offending tag. Matching between tag and directory is exact, including case. Workflows activated before this rule are left as they are and simply have no view.
- `workflow_slug` and its generator are dropped with a migration. `name_key` and `version_key` remain the identity; the Galaxy id remains the per-instance link and never appears in a consumer's code.
- `@gaas/ui` has to publish its `modules/` directory next to `app/`, which its package did not do before.
- A results view receives `analysisId` and a typed `analysis` carrying the workflow, the inputs and the outputs, each with datasets and tags. The props type is imported from `#gaas/ui`, an alias the layer declares for its public types, because Vue resolves a `defineProps` type only through an import in the file and Nuxt does not hand its auto-import declarations to Vue as global type files. Row types stay in `nuxt-galaxy`, where every other row type lives.
- The admin workflows page can say for each activated workflow whether its view is exact, a fallback or none, because the registry is known at build time. The reverse check, a directory that matches no activated workflow, cannot happen at build time since the database is not known then; that column is where it becomes visible.
- **Revisit trigger**: a second per-workflow contract, such as a run form or a description, becomes another fixed file name in the same directory, not a new convention. If a consumer needs a view chosen by something other than name and version, the registry is the place to add it, not the component name.
- Deliberately untouched here, and fixed by #48 since: an analysis runs the revision its workflow row was activated at. ADR 0004 then moved the version label from the tags into a row GaaS publishes for one revision; this convention is unchanged by it, since directories still name the two strings.

## Amendment, 2026-09-24

The pattern gains the plus sign: `^[A-Za-z0-9][A-Za-z0-9._+-]*$`. A Galaxy tool version carries one (`0.10+galaxy2`), so the `version:` tag a publish dialog pre-fills from almost always did, and the rule refused it every time while the scanner, the registry and the matcher already handled a `+` directory, as the fixture trees under `packages/ui/test/fixtures/results-views/` had shown since the convention was written. A `+` is legal in a directory name on Linux and macOS, literal in a URL path segment, and nothing to a component prop; only a query string decodes it to a space, and neither value ever travels in one. The rule was the only thing refusing it, so it is the only thing that changes: the other excluded characters, the leading-character rule and exact matching, case included, are unchanged.

