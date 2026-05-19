# Changelog

All notable changes to this project will be documented in this file.

## [0.0.3](https://gitlab.pasteur.fr/hub/GaaS/compare/v0.0.3-alpha.5...v0.0.3) (2026-05-19)


### Features

* can dynamically set the layout based on the frontmatter ([f70f282](https://gitlab.pasteur.fr/hub/GaaS/commit/f70f282cc9dd990dbc766a7de4240d6f2744834f))
* **database:** can record tags for analysisOutputs ([bd3c947](https://gitlab.pasteur.fr/hub/GaaS/commit/bd3c947a8037996ed5ff516167664c0df8f5eaef))
* **DB:** Create and use postgres views that join with storage objects ([7926cf5](https://gitlab.pasteur.fr/hub/GaaS/commit/7926cf56b1ca31f2e9d7794c5130be73ded9d59b))
* **gaas-cli:** meili document add accept stdin for pipe; print logs to stderr ([886d3db](https://gitlab.pasteur.fr/hub/GaaS/commit/886d3db34d542f36d49c745a09467dbc50571516))
* Handle unexpected and schedule Galaxy downtime  ([1403b24](https://gitlab.pasteur.fr/hub/GaaS/commit/1403b24603282daa2eb23bad6c5a8a62353ea4a5))
* migrate release workflow to commit-and-tag-version with monorepo atomic bump ([7354beb](https://gitlab.pasteur.fr/hub/GaaS/commit/7354beb118084fba2f074cc013692f432ad4efaf))
* **PageHeader:** Can pass all UPageHeader props directly via PageHeader with pageHeaderProps props ([914e97e](https://gitlab.pasteur.fr/hub/GaaS/commit/914e97ec40d50c6de0d33a72132eb173089c3eeb))
* **ui:** add pagination for list analyses ([090e680](https://gitlab.pasteur.fr/hub/GaaS/commit/090e6806acd0be5bb55d1bccffa5359b45449b07))
* **UI:** DataTable categorical header, hide facet nav arrow if no next or previous facet ([c676f6c](https://gitlab.pasteur.fr/hub/GaaS/commit/c676f6c9406aca104ccb3d1b1b92cc5827e22e74))
* **UI:** include UPage* component from nuxt/ui-pro ([5210122](https://gitlab.pasteur.fr/hub/GaaS/commit/52101222e38592f209eae81718c8777d0c7ff552))
* **UI:** text-nowrap for stdout and stderr job output ([121761a](https://gitlab.pasteur.fr/hub/GaaS/commit/121761a309e3c7a51bc60b9959ec6b874c400aa8))
* **utils:** add error utils ([532e7ae](https://gitlab.pasteur.fr/hub/GaaS/commit/532e7ae03840697af265316e9f738538cdff2911))
* **ux:** add global filter for list analyses ([c6054de](https://gitlab.pasteur.fr/hub/GaaS/commit/c6054de8ccc6ae7014c27028a32980f8d11b9630))
* **wiki:** setup test env + add simple one ([53dcb48](https://gitlab.pasteur.fr/hub/GaaS/commit/53dcb48cce323192c8fdfc7857cea5c0857352a4))


### Bug Fixes

* **AppHeader:** sort navigationMenuItems ([9467cee](https://gitlab.pasteur.fr/hub/GaaS/commit/9467cee403c0d055d0fe6bc9e2ffc9fc6153eae6))
* **blendtype - types:** Fix bad types for WorkflowStepExport and add zod runtime validation ([37cc3db](https://gitlab.pasteur.fr/hub/GaaS/commit/37cc3db7a89b7c48451d438ecc6b4ffcdd5de58a))
* **ci:** test if package version exists ([9ca64bb](https://gitlab.pasteur.fr/hub/GaaS/commit/9ca64bb5b97a53858da88efe8d2fdf35ce53a189))
* **ci:** test if package version exists ([dda9de3](https://gitlab.pasteur.fr/hub/GaaS/commit/dda9de338fd5d291c842a1023d1fd6b5d1573dd7))
* **ci:** test if package version exists ([ddf0f8a](https://gitlab.pasteur.fr/hub/GaaS/commit/ddf0f8a620cea8cd39db284f9c3eb37eba90157a))
* **ci:** test if package version exists ([5949f4a](https://gitlab.pasteur.fr/hub/GaaS/commit/5949f4a7f5ed658aedfc4cf3f507245a600cae81))
* **ci:** test if package version exists ([c7757a8](https://gitlab.pasteur.fr/hub/GaaS/commit/c7757a89fd09cd9c51f216bde71d5d728da540e9))
* **ci:** test if package version exists ([739b453](https://gitlab.pasteur.fr/hub/GaaS/commit/739b453aa5cbfefc5ee38014add4b47bf52e778b))
* css not load correctly ([cc799e9](https://gitlab.pasteur.fr/hub/GaaS/commit/cc799e92228323b3257135bd6f524766e8c00d52))
* **database:** add RLS for roles and user_roles ([5984020](https://gitlab.pasteur.fr/hub/GaaS/commit/5984020934c6abac227a8043ecce5cf10fe76d93))
* deprecated option in nuxt/supabase ([b7426c4](https://gitlab.pasteur.fr/hub/GaaS/commit/b7426c447454b8e52c6b2124726aab780fedebe6))
* **deps:** update dependency @nuxt/test-utils to v3.19.1 ([#28](https://gitlab.pasteur.fr/hub/GaaS/issues/28)) ([480bd66](https://gitlab.pasteur.fr/hub/GaaS/commit/480bd6626877d844234995991a866807d9a15a21))
* **deps:** update dependency nuxt-llms to v0.1.3 ([#22](https://gitlab.pasteur.fr/hub/GaaS/issues/22)) ([61e37d5](https://gitlab.pasteur.fr/hub/GaaS/commit/61e37d533601a14819e0d912d8f4e9b09e94c9ff))
* **errors:** throw errors when getting async data for workflow and analysis ([ba7edb4](https://gitlab.pasteur.fr/hub/GaaS/commit/ba7edb45959a5feae62048e3f6a8e877ca5fb1e1))
* **gaas-ui:** Display dataset name ([00df8b7](https://gitlab.pasteur.fr/hub/GaaS/commit/00df8b7f170f131020f435a7978f5ed559551fae))
* **gaas-ui:** missing analysisId page Breadcrumbs item for analysisId ([d1764cb](https://gitlab.pasteur.fr/hub/GaaS/commit/d1764cbd12c65e3e1e6eccbe413b85f9e8720a3c))
* immediate true for useMosaic when watch query ([29df70e](https://gitlab.pasteur.fr/hub/GaaS/commit/29df70ed08c2ba45ca36088ad2a29959d6744515))
* match useFrequencyPartition new api ([cca2ef4](https://gitlab.pasteur.fr/hub/GaaS/commit/cca2ef4d33fb3b1802435cdf6bc6ae644fb63f28))
* **node:buffer:** use Uint8Array instead ([d2f62bc](https://gitlab.pasteur.fr/hub/GaaS/commit/d2f62bc092c2b3a51954afa76a31ae8835db7f75))
* **nuxt-galaxy:** do not throw error if no supabase session found ([d5d89dc](https://gitlab.pasteur.fr/hub/GaaS/commit/d5d89dca3c381d084300ad81a3b7435dc739d73a))
* **nuxt-galaxy:** get disk usage from galaxy schema instead of storage and use pinia queries. ([86577dc](https://gitlab.pasteur.fr/hub/GaaS/commit/86577dcfa5c5fac96c7d227d770a579b6d888c2c))
* revert immediate : true for useAsyncState (change is an error) ([6e74242](https://gitlab.pasteur.fr/hub/GaaS/commit/6e74242d41384643666aa5cf865d9203ac52e1b9))
* set correct layout name ([1f40116](https://gitlab.pasteur.fr/hub/GaaS/commit/1f40116f4eda5ca6450c0eaaaf89e15ab7ec111d))
* storage schema not exposed ([55e0c62](https://gitlab.pasteur.fr/hub/GaaS/commit/55e0c622120b456cdba279c97845d96aee12664e))
* tailwind issue with 'theme(static);' ([f7821c2](https://gitlab.pasteur.fr/hub/GaaS/commit/f7821c2cb7c493c4a233ceebf0d3c9270e6205f6))
* **types:** fix all error types ([8be6a3f](https://gitlab.pasteur.fr/hub/GaaS/commit/8be6a3f2478a0fe7387bedd3c039e68f0cf3c208))
* **ui:** await dataset download query before triggering download ([75c7d98](https://gitlab.pasteur.fr/hub/GaaS/commit/75c7d981866f542ad07e0282c8655cda6199a9e1))
* **wiki:** if default root container does not have children, keep it ([848a053](https://gitlab.pasteur.fr/hub/GaaS/commit/848a05314fa247dc37a3dae0715b93a3d7c500da))
* **wiki:** loop on sanitizedArticles ([7943632](https://gitlab.pasteur.fr/hub/GaaS/commit/79436324d02cb724eaaf1f4cc5561fd2fbd8a57f))
* **wiki:** Redefine wiki root navigation and remove default container ([19c4d4d](https://gitlab.pasteur.fr/hub/GaaS/commit/19c4d4df6b30eec81076c0109a60a4138435f569))
* **wiki:** remove articles and citations duplicate ([19e65a5](https://gitlab.pasteur.fr/hub/GaaS/commit/19e65a56ca90f0389b3b7010380ea6decfd0d29c))
* **wiki:** remove duplicates in useBibliography ([8efbc8b](https://gitlab.pasteur.fr/hub/GaaS/commit/8efbc8b722092a0a7e8b1b049b1368b5734b9add))

# Changelog


## ...main


### 🚀 Enhancements

- **nuxt-galaxy:** Add composable useErrorMessage and useErrorStatus ([ca3f86b](https://github.com/rplanel/gaas/commit/ca3f86b))

### 🩹 Fixes

- **blendtype:** Extract filename from signed url ([39d163b](https://github.com/rplanel/gaas/commit/39d163b))
- **type:** Fix some type error ([c25ea11](https://github.com/rplanel/gaas/commit/c25ea11))
- Create composable to compute the supabase auth token name from subdomain ([b26f786](https://github.com/rplanel/gaas/commit/b26f786))
- Add parameter to set upload file name ([695e69c](https://github.com/rplanel/gaas/commit/695e69c))
- **types:** Fix typecheck ([eba94f9](https://github.com/rplanel/gaas/commit/eba94f9))
- Handle missing data ([d545b3a](https://github.com/rplanel/gaas/commit/d545b3a))

### 📖 Documentation

- **README:** Add some information on this monorepo ([e8c94b9](https://github.com/rplanel/gaas/commit/e8c94b9))
- **README:** Add missing extension ([3f3bed7](https://github.com/rplanel/gaas/commit/3f3bed7))

### 📦 Build

- Workspace command to build all packages ([a5684b1](https://github.com/rplanel/gaas/commit/a5684b1))

### 🏡 Chore

- Prepare monorepo ([65bcf0e](https://github.com/rplanel/gaas/commit/65bcf0e))
- Add lint-staged ([861ed3f](https://github.com/rplanel/gaas/commit/861ed3f))
- **nuxt4:** Change file organisation to match nuxt 4 ([691b747](https://github.com/rplanel/gaas/commit/691b747))
- **font:** Add mdi and streamline font to local ([fd553ba](https://github.com/rplanel/gaas/commit/fd553ba))
- **build:** Use pnpm catalogs ([dc33da5](https://github.com/rplanel/gaas/commit/dc33da5))
- **imports:** Fix missing imports ([f450af7](https://github.com/rplanel/gaas/commit/f450af7))

### ❤️ Contributors

- Remi  PLANEL <rplanel@pasteur.fr>
- Rémi Planel <rplanel@gmail.com>
