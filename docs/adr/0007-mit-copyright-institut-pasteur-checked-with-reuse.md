---
status: accepted
date: 2026-10-15
---

# GaaS is MIT, copyright Institut Pasteur, and REUSE checks every file

GaaS said it was MIT, but not consistently. The root `LICENSE` named `2025 rplanel` as copyright holder, `packages/blendtype/LICENSE` named nobody, and `@gaas/ui` and `@gaas/wiki` went to npm with no `license` field. `reuse lint` found licensing information on none of the repository's 10,158 files. 8,804 of them were twelve other projects' source under `repos/`, seven of which had entered inside unrelated commits. One test fixture, `conditional-repeat-runtime`, was recorded from a Galaxy workflow on usegalaxy.eu whose author set no licence, so the repository and its public GitHub mirror redistributed it without permission.

We decided that **GaaS's own work is MIT, its copyright holder is Institut Pasteur, Rémi Planel is named as its author, and the repository complies with the REUSE specification, which a `reuse:lint` CI job enforces on every merge request**. GaaS's own work covers the code, the documentation, the logo, the lockfiles and the generated files. One root `REUSE.toml` holds every label: a catch-all entry first (`2025 Institut Pasteur`, `MIT`, `SPDX-FileContributor: Rémi Planel <rplanel@gmail.com>`), then one entry per third-party source, since a later entry wins. `LICENSES/` holds the texts of the licences actually used: MIT, Apache-2.0 and CC-BY-4.0. A third-party file carries its real authors and licence, even where its upstream says otherwise. The other projects' source leaves git: agents read it from a shared download at the package version `pnpm-lock.yaml` names, linked into each checkout as the ignored `repos/`.

**The holder is not the author, on purpose.** Under the French intellectual property code, the economic rights in software an employee writes as part of their job belong to the employer (CPI L113-9). The right to be named as author stays with the person who wrote it and never lapses (L121-1); for software, the author's moral rights are limited only on modification and withdrawal (L121-7). The `LICENSE` line naming `rplanel` was therefore wrong, and recording Rémi as `SPDX-FileContributor` is how the right to be named is honoured. The history agrees: the first commits, on 2024-12-31, came from a Pasteur workstation. Pasteur's technology transfer office was told at the same time; if it wants other wording, one line changes in `REUSE.toml` and one in `LICENSE`.

## Considered options

- **MPL-2.0**: rejected. It makes changes to GaaS's own files public when someone distributes them, and little of how GaaS is used does that. A portal extends the layers with files of its own, which may carry any licence, and runs `nuxt-galaxy` on its own server, which is not distribution. It also expects its notice in or beside each file.
- **AGPL-3.0**: rejected. A portal built on the layers is a work based on them, so every portal would have to be AGPL and offer its source to its users, other teams' portals at Pasteur included. GaaS is building blocks for other people's Galaxy portals, and Galaxy itself has been entirely MIT since 2026-02-25.
- **`blendtype` MIT, the Nuxt packages MPL-2.0 or AGPL**: rejected. It puts the copyleft on exactly the packages portals use, and with two licences in one repository, code cannot move between packages without a relicensing decision.
- **Rémi Planel, or both, as holder**: rejected under L113-9.
- **A header in every file**: rejected for now. About a thousand files would change, lockfiles, migrations and generated types among them, and npm users receive the built `dist/` with `LICENSE`, not the headers. A header added later overrides the catch-all.
- **Keeping the other projects in git, labelled**: rejected. The repository and its public mirror would go on carrying 8,804 files of other projects' source.
- **Git submodules for them**: rejected. Every worktree would need `git submodule update --init` before agents could read them.

Revisit trigger: a concrete reason to stop closed derivatives of GaaS, such as a closed product built on its components, or a funder requiring copyleft. Moving from MIT to a stricter licence stays possible after outside contributions, since MIT lets anyone redistribute under stricter terms; moving back would need every copyright holder's consent.

## Consequences

- **The `vue` agent skill is labelled CC-BY-4.0 although antfu/skills calls it MIT.** It is generated from vuejs/docs, which is CC-BY-4.0, and a redistributor cannot relicense that. Do not "fix" the label to match upstream.
- **A new third-party file fails CI** until `REUSE.toml` has an entry for it.
- **Package releases up to `0.0.4-beta.5` keep the old `LICENSE` line.** They stay MIT; only the holder named in their notice is stale.
- **`conditional-repeat-runtime` is re-recorded from a Galaxy workflow rebuilt for GaaS**, with the same five steps and tools, shared publicly on usegalaxy.eu under MIT. No openly licensed Galaxy workflow on usegalaxy.eu or WorkflowHub had every shape its tests rely on.
- **The other projects stay in git history**, which was not rewritten: the release tags npm publishing from the mirror depends on (ADR 0006) would have changed hash.
- **How agents read the other projects is a candidate for rpstack.** It is built in GaaS first, and its promotion to an rpstack Convention is tracked there.
