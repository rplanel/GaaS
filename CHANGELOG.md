# Changelog

All notable changes to this project will be documented in this file.

## [0.0.4-beta.8](https://gitlab.pasteur.fr/gaas/GaaS/compare/v0.0.4-beta.7...v0.0.4-beta.8) (2026-10-19)


### Bug Fixes

* **nuxt-galaxy:** narrow the API roles' grants on the galaxy schema [#171](https://gitlab.pasteur.fr/gaas/GaaS/issues/171) ([4ad0535](https://gitlab.pasteur.fr/gaas/GaaS/commit/4ad053532e933e5fd1b7dd4f4ba4377d13e901c0))

## [0.0.4-beta.7](https://gitlab.pasteur.fr/gaas/GaaS/compare/v0.0.4-beta.6...v0.0.4-beta.7) (2026-10-18)


### ⚠ BREAKING CHANGES

* **ui:** `@gaas/wiki` is no longer published. Its wiki pages,
layouts, DOI citations and content search are part of `@gaas/ui`, so an
app extends `@gaas/ui` instead, in `package.json` and in `extends`. The
wiki's collection schemas are at `@gaas/ui/app/schemas/wiki`. Every app
on `@gaas/ui` now serves `/wiki` and shows the Wiki menu link.

* **ui:** serve the wiki from @gaas/ui and remove @gaas/wiki [#157](https://gitlab.pasteur.fr/gaas/GaaS/issues/157) ([1f22a0d](https://gitlab.pasteur.fr/gaas/GaaS/commit/1f22a0dc6457dfcc584147328b90f621f801e860))


### Bug Fixes

* **ui:** address the code-review findings on !179 [#157](https://gitlab.pasteur.fr/gaas/GaaS/issues/157) ([0615c9d](https://gitlab.pasteur.fr/gaas/GaaS/commit/0615c9d439a8c6795f616d89f7e03de4cf13a125))

## [0.0.4-beta.6](https://gitlab.pasteur.fr/gaas/GaaS/compare/v0.0.4-beta.5...v0.0.4-beta.6) (2026-10-16)


### Features

* **ui:** show the GaaS mark in the app header ([b921bec](https://gitlab.pasteur.fr/gaas/GaaS/commit/b921bec08e93a2fe2fca8d140476c0f9387c015b))


### Bug Fixes

* **gaas-cli:** declare MIT and put the licence text in the wheel [#151](https://gitlab.pasteur.fr/gaas/GaaS/issues/151) ([0ceff47](https://gitlab.pasteur.fr/gaas/GaaS/commit/0ceff4763fc85c592733d447f5224875ef444de5))
* name Institut Pasteur in the LICENSE every npm package ships [#151](https://gitlab.pasteur.fr/gaas/GaaS/issues/151) ([78b9ec5](https://gitlab.pasteur.fr/gaas/GaaS/commit/78b9ec56e0940e2dc65dd85e2eb85ddc798384df))

## [0.0.4-beta.5](https://gitlab.pasteur.fr/gaas/GaaS/compare/v0.0.4-beta.4...v0.0.4-beta.5) (2026-10-15)

## [0.0.4-beta.4](https://gitlab.pasteur.fr/gaas/GaaS/compare/v0.0.4-beta.3...v0.0.4-beta.4) (2026-10-15)


### ⚠ BREAKING CHANGES

* **ui:** `useGalaxyTool` and `useGalaxyWorkflow` are removed. Use
`useGalaxyWorkflowDescription(workflowId, revision)`, which answers a
revision's steps, inputs and tool definitions in one cached request.
`workflowToolIds` is gone with them — nothing needs it now that the tools
arrive with the workflow — and the revision, optional before, is required.
`toolsObj` and `toolInputParameters` keep their shape and their keys.

### Features

* allow a plus sign in a version's name and label ([a8cfd67](https://gitlab.pasteur.fr/gaas/GaaS/commit/a8cfd67b55a3fcff057387c68e55fc78c84116e2))
* **blendtype:** carry the revision uuid a workflow export names ([0f5eb84](https://gitlab.pasteur.fr/gaas/GaaS/commit/0f5eb847d8974f7c1caa6d1d98db0bf329eb70e6))
* **blendtype:** list a stored workflow's revisions and export one by index ([799adbd](https://gitlab.pasteur.fr/gaas/GaaS/commit/799adbdb5e97adf81a47a3904f1ba584c135d1f5)), closes [#73](https://gitlab.pasteur.fr/gaas/GaaS/issues/73)
* **blendtype:** log through a BlendTypeLogger tag, not Effect.log ([2aafabd](https://gitlab.pasteur.fr/gaas/GaaS/commit/2aafabd69b03fa1b44d110dd565cb866a4903463)), closes [#13](https://gitlab.pasteur.fr/gaas/GaaS/issues/13)
* **landing:** add customizable landing page ([f996d02](https://gitlab.pasteur.fr/gaas/GaaS/commit/f996d02cd85379a5697df475e95a703e64e50b48))
* **nuxt-galaxy:** a bucket width on both usage endpoints ([28711c7](https://gitlab.pasteur.fr/gaas/GaaS/commit/28711c7d8c5c278ddee73742de25240b71e2e1fc)), closes [#18](https://gitlab.pasteur.fr/gaas/GaaS/issues/18)
* **nuxt-galaxy:** a time range on both usage endpoints ([36208d6](https://gitlab.pasteur.fr/gaas/GaaS/commit/36208d6a448846f5143f639a80e5f14937dfae5e)), closes [#17](https://gitlab.pasteur.fr/gaas/GaaS/issues/17)
* **nuxt-galaxy:** accept a time range in the usage statistics queries ([c03186d](https://gitlab.pasteur.fr/gaas/GaaS/commit/c03186d8ee50886a3a4899958fe3220da4db5028)), closes [#17](https://gitlab.pasteur.fr/gaas/GaaS/issues/17)
* **nuxt-galaxy:** delete a version no analysis references ([eeed023](https://gitlab.pasteur.fr/gaas/GaaS/commit/eeed0230672c22917342edc497f610ef95124d2f)), closes [#72](https://gitlab.pasteur.fr/gaas/GaaS/issues/72) [#71](https://gitlab.pasteur.fr/gaas/GaaS/issues/71)
* **nuxt-galaxy:** describe one workflow revision in a single cached call ([50dbe45](https://gitlab.pasteur.fr/gaas/GaaS/commit/50dbe4566fc17d8ef538753983581c4ace58ec88)), closes [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87) [#75](https://gitlab.pasteur.fr/gaas/GaaS/issues/75) [#96](https://gitlab.pasteur.fr/gaas/GaaS/issues/96) [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87) [#96](https://gitlab.pasteur.fr/gaas/GaaS/issues/96)
* **nuxt-galaxy:** narrow usage statistics to one workflow ([1de8507](https://gitlab.pasteur.fr/gaas/GaaS/commit/1de8507c8eb85665270b89703a1c86d560c463b9)), closes [#19](https://gitlab.pasteur.fr/gaas/GaaS/issues/19) [#17](https://gitlab.pasteur.fr/gaas/GaaS/issues/17)
* **nuxt-galaxy:** publish the latest revision under a typed label ([ccea9ed](https://gitlab.pasteur.fr/gaas/GaaS/commit/ccea9edeb98f67ecf7043f503bf37a04448e8de0)), closes [#26](https://gitlab.pasteur.fr/gaas/GaaS/issues/26) [#64](https://gitlab.pasteur.fr/gaas/GaaS/issues/64)
* **nuxt-galaxy:** publish the revision the body names ([8575a56](https://gitlab.pasteur.fr/gaas/GaaS/commit/8575a56ec7e967600941b1ff9047eb8287ee93a1)), closes [#73](https://gitlab.pasteur.fr/gaas/GaaS/issues/73)
* **nuxt-galaxy:** read whether a version can still run, live from Galaxy ([3b7411d](https://gitlab.pasteur.fr/gaas/GaaS/commit/3b7411d7c0890cabcb51daba9fce5e522cb267c7)), closes [#76](https://gitlab.pasteur.fr/gaas/GaaS/issues/76)
* **nuxt-galaxy:** refuse a tag value that cannot name a results view directory ([14d3941](https://gitlab.pasteur.fr/gaas/GaaS/commit/14d394135a2ae89a32c67bf81efe38718a13b43f)), closes [#50](https://gitlab.pasteur.fr/gaas/GaaS/issues/50)
* **nuxt-galaxy:** refuse to publish a revision whose tools are missing at their pinned version ([4944122](https://gitlab.pasteur.fr/gaas/GaaS/commit/494412227f2f48e983c08562c5d81685a9bd44ad)), closes [#75](https://gitlab.pasteur.fr/gaas/GaaS/issues/75)
* **nuxt-galaxy:** retire a version and make it active again ([da9c330](https://gitlab.pasteur.fr/gaas/GaaS/commit/da9c33000aebb6207195fb0ebbb51781a4aa890f)), closes [#71](https://gitlab.pasteur.fr/gaas/GaaS/issues/71)
* **nuxt-galaxy:** start an analysis on the revision that was activated ([a42b02a](https://gitlab.pasteur.fr/gaas/GaaS/commit/a42b02af1d7542cb26695b7b603deb8b511342ff)), closes [#39](https://gitlab.pasteur.fr/gaas/GaaS/issues/39) [#48](https://gitlab.pasteur.fr/gaas/GaaS/issues/48)
* **opencode:** add review loop agents ([a927e1e](https://gitlab.pasteur.fr/gaas/GaaS/commit/a927e1ebe6475773ddc7bfed7d485de6e00420f7))
* refuse a required unconnected dataset input on Galaxy 24.2 and later [#105](https://gitlab.pasteur.fr/gaas/GaaS/issues/105) ([e4d1603](https://gitlab.pasteur.fr/gaas/GaaS/commit/e4d1603c50be5417688a1d95b77b0c94b6319643)), closes [#97](https://gitlab.pasteur.fr/gaas/GaaS/issues/97) [#142](https://gitlab.pasteur.fr/gaas/GaaS/issues/142)
* **skills:** add gaas-cli dev skills ([514bf63](https://gitlab.pasteur.fr/gaas/GaaS/commit/514bf63eb60cdc6bd660c3f3bf519a859c44df58))
* **ui:** a Delete control with confirmation beside each version ([3d2a05b](https://gitlab.pasteur.fr/gaas/GaaS/commit/3d2a05bcd66c75113e71330616b2a30928a54326)), closes [#72](https://gitlab.pasteur.fr/gaas/GaaS/issues/72)
* **ui:** a state badge beside each version, and a row for a stored workflow Galaxy no longer lists ([89afa5b](https://gitlab.pasteur.fr/gaas/GaaS/commit/89afa5b3f25a878082b3b01ab3f2060c9263f86d))
* **ui:** an Active switch beside each version on the admin workflows page ([550daa0](https://gitlab.pasteur.fr/gaas/GaaS/commit/550daa0afe14fee43cbf0c4d2a63652385c621e8)), closes [#71](https://gitlab.pasteur.fr/gaas/GaaS/issues/71)
* **ui:** choose the revision to publish in the publish dialog ([a01f719](https://gitlab.pasteur.fr/gaas/GaaS/commit/a01f7195be119c55a71cd3bd2cbb02902dfc68bb)), closes [#73](https://gitlab.pasteur.fr/gaas/GaaS/issues/73)
* **ui:** choose the trend's bucket width, or let the range choose ([082c248](https://gitlab.pasteur.fr/gaas/GaaS/commit/082c24835ce9a1b22b87bbef020378a7d3ea891a)), closes [#18](https://gitlab.pasteur.fr/gaas/GaaS/issues/18)
* **ui:** derive the invoke form and the analysis panel from one composable ([cadc679](https://gitlab.pasteur.fr/gaas/GaaS/commit/cadc679b9224ebaebe97e7b7edae0098a5a3ffe2)), closes [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87) [#96](https://gitlab.pasteur.fr/gaas/GaaS/issues/96) [#86](https://gitlab.pasteur.fr/gaas/GaaS/issues/86) [#97](https://gitlab.pasteur.fr/gaas/GaaS/issues/97) [#86](https://gitlab.pasteur.fr/gaas/GaaS/issues/86) [#91](https://gitlab.pasteur.fr/gaas/GaaS/issues/91) [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87) [#96](https://gitlab.pasteur.fr/gaas/GaaS/issues/96)
* **ui:** draw a workflow revision as a graph ([63c911d](https://gitlab.pasteur.fr/gaas/GaaS/commit/63c911dff4c9b22ad578c5e1d9148caa9b23ca55)), closes [#90](https://gitlab.pasteur.fr/gaas/GaaS/issues/90) [#90](https://gitlab.pasteur.fr/gaas/GaaS/issues/90) [#91](https://gitlab.pasteur.fr/gaas/GaaS/issues/91) [#90](https://gitlab.pasteur.fr/gaas/GaaS/issues/90) [#89](https://gitlab.pasteur.fr/gaas/GaaS/issues/89)
* **ui:** fall back to name-level and app-wide results views ([f2d67a4](https://gitlab.pasteur.fr/gaas/GaaS/commit/f2d67a4bf071f1e9f85a77f7fa6b47f0603ee2e8))
* **ui:** find an exact-version results view by directory ([fbe6214](https://gitlab.pasteur.fr/gaas/GaaS/commit/fbe62144d06c442e14631f9aba56cf25338ef6c0)), closes [#51](https://gitlab.pasteur.fr/gaas/GaaS/issues/51)
* **ui:** global usage page for administrators ([fb48efc](https://gitlab.pasteur.fr/gaas/GaaS/commit/fb48efc6a866d0b07b8573fc4477af17f858b9d8)), closes [#16](https://gitlab.pasteur.fr/gaas/GaaS/issues/16) [#14](https://gitlab.pasteur.fr/gaas/GaaS/issues/14)
* **ui:** hand a results view its analysis, typed ([bf5f52a](https://gitlab.pasteur.fr/gaas/GaaS/commit/bf5f52abef4f19c4df05ebad6d30c05f1354425a)), closes [#52](https://gitlab.pasteur.fr/gaas/GaaS/issues/52)
* **ui:** let the generic results view speak to users and hint developers ([94de3fd](https://gitlab.pasteur.fr/gaas/GaaS/commit/94de3fde144cfff80123fd29533c80d87121ab73)), closes [#54](https://gitlab.pasteur.fr/gaas/GaaS/issues/54)
* **ui:** mark per-step state on the invocation graph ([e216dbc](https://gitlab.pasteur.fr/gaas/GaaS/commit/e216dbc3b321f5333a49ef945a4d31b2a99a78e9)), closes [#118](https://gitlab.pasteur.fr/gaas/GaaS/issues/118) [#119](https://gitlab.pasteur.fr/gaas/GaaS/issues/119) [#84](https://gitlab.pasteur.fr/gaas/GaaS/issues/84)
* **ui:** name a connection only while a reader is on it [#135](https://gitlab.pasteur.fr/gaas/GaaS/issues/135) ([90c6b8c](https://gitlab.pasteur.fr/gaas/GaaS/commit/90c6b8c45d822dd413c976de3794c2155c8c411c)), closes [#136](https://gitlab.pasteur.fr/gaas/GaaS/issues/136)
* **ui:** own usage page with tiles and per-workflow table ([1fae30f](https://gitlab.pasteur.fr/gaas/GaaS/commit/1fae30f2c5161e7b77d649813661e64c276e02fb)), closes [#14](https://gitlab.pasteur.fr/gaas/GaaS/issues/14) [#16](https://gitlab.pasteur.fr/gaas/GaaS/issues/16)
* **ui:** pick a custom range in a calendar ([16a9dda](https://gitlab.pasteur.fr/gaas/GaaS/commit/16a9ddac178446710bf708748fa4d7356c4392d0)), closes [#17](https://gitlab.pasteur.fr/gaas/GaaS/issues/17)
* **ui:** pick a workflow out of the table to narrow the view ([227c1c7](https://gitlab.pasteur.fr/gaas/GaaS/commit/227c1c7ebb7f56ad73e2b533056c85cbb329135d)), closes [#19](https://gitlab.pasteur.fr/gaas/GaaS/issues/19)
* **ui:** publish a version from the admin workflows page ([9dc9ffd](https://gitlab.pasteur.fr/gaas/GaaS/commit/9dc9ffd334af3233d2e69a84983c8dee41758fa1))
* **ui:** route a connection spanning several ranks round the steps between [#136](https://gitlab.pasteur.fr/gaas/GaaS/issues/136) ([6066bb8](https://gitlab.pasteur.fr/gaas/GaaS/commit/6066bb82c4abe199d20282328886b17483a49d9e)), closes [#121](https://gitlab.pasteur.fr/gaas/GaaS/issues/121) [#134](https://gitlab.pasteur.fr/gaas/GaaS/issues/134) [#123](https://gitlab.pasteur.fr/gaas/GaaS/issues/123)
* **ui:** show each workflow's outcomes as a bar in its row ([2bae408](https://gitlab.pasteur.fr/gaas/GaaS/commit/2bae40879244f83875c8f78c91479a80bd98f98f)), closes [#19](https://gitlab.pasteur.fr/gaas/GaaS/issues/19)
* **ui:** tell administrators which workflows have a results view ([faf261a](https://gitlab.pasteur.fr/gaas/GaaS/commit/faf261ad80a1ef122bc83fce2df8d2948113213f))
* **ui:** the publish dialog always names the revision it shows ([06f363f](https://gitlab.pasteur.fr/gaas/GaaS/commit/06f363f45c27c688038eaac7e57b625c3b49de2d))
* **ui:** the publish dialog checks the selected revision's tools before Publish ([5f39f56](https://gitlab.pasteur.fr/gaas/GaaS/commit/5f39f564206cffe2657cdd867c22eb72778322f0)), closes [#75](https://gitlab.pasteur.fr/gaas/GaaS/issues/75)
* **ui:** time-range filter on both usage pages ([805874c](https://gitlab.pasteur.fr/gaas/GaaS/commit/805874c1decdd135e03804902d45a3b30b2ced6e)), closes [#17](https://gitlab.pasteur.fr/gaas/GaaS/issues/17)
* **ui:** trend chart in the usage statistics view ([44382c9](https://gitlab.pasteur.fr/gaas/GaaS/commit/44382c959cae1324c5a4f6bce1cfe30f8d7b8631)), closes [#15](https://gitlab.pasteur.fr/gaas/GaaS/issues/15)


### Bug Fixes

* **blendtype:** ask Galaxy for a tool version with the parameter it reads ([cf04bff](https://gitlab.pasteur.fr/gaas/GaaS/commit/cf04bffda411d3d9d6c960af10108376b86d3597)), closes [#75](https://gitlab.pasteur.fr/gaas/GaaS/issues/75)
* **blendtype:** close what the [#102](https://gitlab.pasteur.fr/gaas/GaaS/issues/102) review found ([0945389](https://gitlab.pasteur.fr/gaas/GaaS/commit/09453895be4acff74f1d06efae629b3afc0021d2))
* **blendtype:** close what the [#110](https://gitlab.pasteur.fr/gaas/GaaS/issues/110) review found ([f10a999](https://gitlab.pasteur.fr/gaas/GaaS/commit/f10a9993a55e1538cea60aed5025abdfdafe6cb4)), closes [#102](https://gitlab.pasteur.fr/gaas/GaaS/issues/102) [#101](https://gitlab.pasteur.fr/gaas/GaaS/issues/101)
* **blendtype:** close what the [#13](https://gitlab.pasteur.fr/gaas/GaaS/issues/13) review found ([7da72e1](https://gitlab.pasteur.fr/gaas/GaaS/commit/7da72e10e1847300c3497296a8be06c6ff4a0bb0))
* **blendtype:** keep a stored definition's connections, position and when ([834f8c1](https://gitlab.pasteur.fr/gaas/GaaS/commit/834f8c1124584e15b5b797138a0b0cb3e2a902b1)), closes [#82](https://gitlab.pasteur.fr/gaas/GaaS/issues/82)
* **blendtype:** let the saved-value types hold what Galaxy sends ([482a335](https://gitlab.pasteur.fr/gaas/GaaS/commit/482a33559aa745d6ab8b24b102d2e42454252638)), closes [#102](https://gitlab.pasteur.fr/gaas/GaaS/issues/102) [#97](https://gitlab.pasteur.fr/gaas/GaaS/issues/97)
* **blendtype:** read a boolean parameter the same on 22.05 and 26.1 ([2fc6bca](https://gitlab.pasteur.fr/gaas/GaaS/commit/2fc6bca778c94caf08b519b9bc46e7468734d303)), closes [#110](https://gitlab.pasteur.fr/gaas/GaaS/issues/110) [#102](https://gitlab.pasteur.fr/gaas/GaaS/issues/102) [#101](https://gitlab.pasteur.fr/gaas/GaaS/issues/101)
* **blendtype:** send a tool version with a plus to Galaxy as a plus ([a11c747](https://gitlab.pasteur.fr/gaas/GaaS/commit/a11c747b51d18d229c555a1f25123b50e731f529))
* close what the [#113](https://gitlab.pasteur.fr/gaas/GaaS/issues/113) review found ([5a15222](https://gitlab.pasteur.fr/gaas/GaaS/commit/5a152222eea58d1a348403ee7c20f1407ddfd923)), closes [#112](https://gitlab.pasteur.fr/gaas/GaaS/issues/112)
* close what the [#99](https://gitlab.pasteur.fr/gaas/GaaS/issues/99) review found ([2fbf16b](https://gitlab.pasteur.fr/gaas/GaaS/commit/2fbf16b4c7dbb1a7650d96380794fc8306498da2))
* list the stored workflows hidden in Galaxy, so they are not read as vanished ([625194f](https://gitlab.pasteur.fr/gaas/GaaS/commit/625194f77ceafa7c487fede7ded1db7754555903))
* **nuxt-galaxy:** accept a workflow whose export carries revision 0 at activation ([b7080e9](https://gitlab.pasteur.fr/gaas/GaaS/commit/b7080e9d0784b438b46ba270c330bff0573112e5)), closes [#66](https://gitlab.pasteur.fr/gaas/GaaS/issues/66)
* **nuxt-galaxy:** answer 404 for what Galaxy does not hold, and a sentence for every refusal [#125](https://gitlab.pasteur.fr/gaas/GaaS/issues/125) ([376b4be](https://gitlab.pasteur.fr/gaas/GaaS/commit/376b4bea68a25dc0f64c874e65c1e8df516f04f3))
* **nuxt-galaxy:** answer 503, not 500, when Galaxy is down ([ae21ce6](https://gitlab.pasteur.fr/gaas/GaaS/commit/ae21ce6e7abf954d6d5c62afe4b6fe6bc11777f8)), closes [#42](https://gitlab.pasteur.fr/gaas/GaaS/issues/42)
* **nuxt-galaxy:** answer a failed analysis creation with a status ([c9006e0](https://gitlab.pasteur.fr/gaas/GaaS/commit/c9006e0deef85ff7857abf37a0c8b40bbdce6615)), closes [#31](https://gitlab.pasteur.fr/gaas/GaaS/issues/31) [#25](https://gitlab.pasteur.fr/gaas/GaaS/issues/25)
* **nuxt-galaxy:** answer a revision Galaxy does not have with 404, not 500 ([3d4d3bd](https://gitlab.pasteur.fr/gaas/GaaS/commit/3d4d3bdef26b7067b9ea957d9be0a5a2dbbf82bd))
* **nuxt-galaxy:** bound an open-ended range and an oversized workflow id ([dd0470c](https://gitlab.pasteur.fr/gaas/GaaS/commit/dd0470caef6ad0785678fed8d34f5e9852150130)), closes [#17](https://gitlab.pasteur.fr/gaas/GaaS/issues/17)
* **nuxt-galaxy:** close the gaps a review of the description endpoint found ([5998dba](https://gitlab.pasteur.fr/gaas/GaaS/commit/5998dba7ba47ac91790b37816bfae78faa23769a)), closes [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87)
* **nuxt-galaxy:** close what a review of the [#97](https://gitlab.pasteur.fr/gaas/GaaS/issues/97) mark found ([b09dd08](https://gitlab.pasteur.fr/gaas/GaaS/commit/b09dd082c6752b88bb5861303ecd33e561ad06a1))
* **nuxt-galaxy:** close what the [#106](https://gitlab.pasteur.fr/gaas/GaaS/issues/106) review found ([00618ed](https://gitlab.pasteur.fr/gaas/GaaS/commit/00618ed3c7a961117a53990909e3f15ba1afea72))
* **nuxt-galaxy:** close what the [#119](https://gitlab.pasteur.fr/gaas/GaaS/issues/119) review found ([f2ece54](https://gitlab.pasteur.fr/gaas/GaaS/commit/f2ece54fa909f7962589ef4f32072355c4c39001)), closes [#106](https://gitlab.pasteur.fr/gaas/GaaS/issues/106)
* **nuxt-galaxy:** correct what the [#97](https://gitlab.pasteur.fr/gaas/GaaS/issues/97) mark promises, per Galaxy's source ([ad0623b](https://gitlab.pasteur.fr/gaas/GaaS/commit/ad0623bafe0ec3aecad0bfdce81ee74e45788a28))
* **nuxt-galaxy:** fold the revisions and tool-check proxies with toHttpError [#125](https://gitlab.pasteur.fr/gaas/GaaS/issues/125) ([db0fe78](https://gitlab.pasteur.fr/gaas/GaaS/commit/db0fe78df11037bbce75bfe32ceff04ca8ab59d3))
* **nuxt-galaxy:** give every fixture load its own content database ([6ee408c](https://gitlab.pasteur.fr/gaas/GaaS/commit/6ee408c24f43c8e2d07780bd0622dea5ebbd6b24)), closes [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87) [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87) [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87)
* **nuxt-galaxy:** guard every /api/galaxy route [#99](https://gitlab.pasteur.fr/gaas/GaaS/issues/99) ([014c350](https://gitlab.pasteur.fr/gaas/GaaS/commit/014c350b9637af9c9afc64de7ff814b411fc6cca)), closes [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87)
* **nuxt-galaxy:** record every job of a mapped step ([a6a28d2](https://gitlab.pasteur.fr/gaas/GaaS/commit/a6a28d22a9b2e04b2245a76382335ab34cfeec55)), closes [#84](https://gitlab.pasteur.fr/gaas/GaaS/issues/84)
* **nuxt-galaxy:** record the jobs of a subworkflow step ([5467ac3](https://gitlab.pasteur.fr/gaas/GaaS/commit/5467ac3d99f0a031caac1cda301e886b283b9dcd)), closes [#84](https://gitlab.pasteur.fr/gaas/GaaS/issues/84) [#119](https://gitlab.pasteur.fr/gaas/GaaS/issues/119)
* **nuxt-galaxy:** refuse a datamap that cannot start the workflow it names ([5e85f31](https://gitlab.pasteur.fr/gaas/GaaS/commit/5e85f310f5f36350b69101433be4ff53d8f75fa6)), closes [#39](https://gitlab.pasteur.fr/gaas/GaaS/issues/39) [#39](https://gitlab.pasteur.fr/gaas/GaaS/issues/39) [#43](https://gitlab.pasteur.fr/gaas/GaaS/issues/43)
* **nuxt-galaxy:** refuse a malformed analysis request before anything is created ([ed0201e](https://gitlab.pasteur.fr/gaas/GaaS/commit/ed0201ee93b9a4bde99d10d27f6a4cd642799e03)), closes [#40](https://gitlab.pasteur.fr/gaas/GaaS/issues/40) [#43](https://gitlab.pasteur.fr/gaas/GaaS/issues/43) [#47](https://gitlab.pasteur.fr/gaas/GaaS/issues/47)
* **nuxt-galaxy:** refuse a route parameter that names no resource ([bcd4466](https://gitlab.pasteur.fr/gaas/GaaS/commit/bcd4466bcfe482546d240d0b380555ade50b3535)), closes [#25](https://gitlab.pasteur.fr/gaas/GaaS/issues/25) [#28](https://gitlab.pasteur.fr/gaas/GaaS/issues/28)
* **nuxt-galaxy:** refuse an unauthenticated workflow import ([2f1aa08](https://gitlab.pasteur.fr/gaas/GaaS/commit/2f1aa08097123cd92785502bc8c0616e25609c0a)), closes [#24](https://gitlab.pasteur.fr/gaas/GaaS/issues/24)
* **nuxt-galaxy:** repair the SQL behind usage statistics ([75f5675](https://gitlab.pasteur.fr/gaas/GaaS/commit/75f56759d73e9e4e6647ad9d661f86955abac66c))
* **nuxt-galaxy:** the histories listing answered 500 for a Galaxy outage ([d1a9512](https://gitlab.pasteur.fr/gaas/GaaS/commit/d1a95129e4cfa1efcb28f0defcf578bcdaa5828c))
* **nuxt-galaxy:** unwind the analysis a failed request had prepared ([dfa52a0](https://gitlab.pasteur.fr/gaas/GaaS/commit/dfa52a08eba030f76961de14446934a240adc001)), closes [#39](https://gitlab.pasteur.fr/gaas/GaaS/issues/39) [#39](https://gitlab.pasteur.fr/gaas/GaaS/issues/39) [#39](https://gitlab.pasteur.fr/gaas/GaaS/issues/39)
* show a revision by Galaxy's number, keep the index in the API ([9817111](https://gitlab.pasteur.fr/gaas/GaaS/commit/9817111d72569bfd34e77c2188a0d651aa69cdac))
* **ui:** call the Galaxy instance's release a release, not a version [#105](https://gitlab.pasteur.fr/gaas/GaaS/issues/105) ([e66f672](https://gitlab.pasteur.fr/gaas/GaaS/commit/e66f67245e1e2e5b519dfd05c14e3fcf4309f13a))
* **ui:** close the gaps a review of the composable swap found ([0e93016](https://gitlab.pasteur.fr/gaas/GaaS/commit/0e930166198c6a0843d00e74f68a4b9130cc3bac)), closes [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87) [#100](https://gitlab.pasteur.fr/gaas/GaaS/issues/100) [#86](https://gitlab.pasteur.fr/gaas/GaaS/issues/86) [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87) [#100](https://gitlab.pasteur.fr/gaas/GaaS/issues/100)
* **ui:** close what a review of the [#89](https://gitlab.pasteur.fr/gaas/GaaS/issues/89) graph found ([f171d2d](https://gitlab.pasteur.fr/gaas/GaaS/commit/f171d2d7884e8e1f34fc21a0f5837f8814c1e54d)), closes [#91](https://gitlab.pasteur.fr/gaas/GaaS/issues/91)
* **ui:** close what the [#101](https://gitlab.pasteur.fr/gaas/GaaS/issues/101) review found ([30ebb91](https://gitlab.pasteur.fr/gaas/GaaS/commit/30ebb91533d29d7a288f8d55c1fd29d6fb59703b)), closes [#98](https://gitlab.pasteur.fr/gaas/GaaS/issues/98) [#104](https://gitlab.pasteur.fr/gaas/GaaS/issues/104) [#95](https://gitlab.pasteur.fr/gaas/GaaS/issues/95) [#98](https://gitlab.pasteur.fr/gaas/GaaS/issues/98) [#115](https://gitlab.pasteur.fr/gaas/GaaS/issues/115) [#94](https://gitlab.pasteur.fr/gaas/GaaS/issues/94) [#116](https://gitlab.pasteur.fr/gaas/GaaS/issues/116) [#97](https://gitlab.pasteur.fr/gaas/GaaS/issues/97)
* **ui:** close what the [#111](https://gitlab.pasteur.fr/gaas/GaaS/issues/111) review found ([90a9ef8](https://gitlab.pasteur.fr/gaas/GaaS/commit/90a9ef8e9a45ff36b2d64a6f18e6dfaaf2d9a151))
* **ui:** close what the [#121](https://gitlab.pasteur.fr/gaas/GaaS/issues/121) review found ([6e2558d](https://gitlab.pasteur.fr/gaas/GaaS/commit/6e2558de933f643acb824b150c7601591c7528e3))
* **ui:** close what the [#90](https://gitlab.pasteur.fr/gaas/GaaS/issues/90) review found ([c014d70](https://gitlab.pasteur.fr/gaas/GaaS/commit/c014d70106950334700564ba7484326c9a7392b0))
* **ui:** contain results views on the client after review ([8997685](https://gitlab.pasteur.fr/gaas/GaaS/commit/8997685f4000a4dcff3ecbc553dc2c9bb27e2cd5))
* **ui:** describe an analysis with the workflow revision it ran ([82d65a9](https://gitlab.pasteur.fr/gaas/GaaS/commit/82d65a93eb9c7e80d080cb0ea59f19937d76de62)), closes [#48](https://gitlab.pasteur.fr/gaas/GaaS/issues/48) [#48](https://gitlab.pasteur.fr/gaas/GaaS/issues/48) [#48](https://gitlab.pasteur.fr/gaas/GaaS/issues/48) [#48](https://gitlab.pasteur.fr/gaas/GaaS/issues/48) [#67](https://gitlab.pasteur.fr/gaas/GaaS/issues/67) [#68](https://gitlab.pasteur.fr/gaas/GaaS/issues/68)
* **ui:** keep a connection's name readable and its selection local [#135](https://gitlab.pasteur.fr/gaas/GaaS/issues/135) ([2a57826](https://gitlab.pasteur.fr/gaas/GaaS/commit/2a5782684b4b53a9b653774d38c2a8673187a718))
* **ui:** lay the graph out from every connection ([94a1e4c](https://gitlab.pasteur.fr/gaas/GaaS/commit/94a1e4c5c919ed8ac6207e3af53efcbb7a58c361)), closes [#121](https://gitlab.pasteur.fr/gaas/GaaS/issues/121)
* **ui:** mark a step whose data parameter nothing feeds ([b40cb3c](https://gitlab.pasteur.fr/gaas/GaaS/commit/b40cb3ce5937511a826d1b3d6a1c3e97458fd261)), closes [#97](https://gitlab.pasteur.fr/gaas/GaaS/issues/97) [#86](https://gitlab.pasteur.fr/gaas/GaaS/issues/86) [#86](https://gitlab.pasteur.fr/gaas/GaaS/issues/86) [#88](https://gitlab.pasteur.fr/gaas/GaaS/issues/88) [#97](https://gitlab.pasteur.fr/gaas/GaaS/issues/97)
* **ui:** offer parameters for every tool step, not only the last ([c04de64](https://gitlab.pasteur.fr/gaas/GaaS/commit/c04de645d476f4c804729a0d979d17ba45e847ae)), closes [#83](https://gitlab.pasteur.fr/gaas/GaaS/issues/83)
* **ui:** read a saved boolean the way Galaxy reads it ([0771a7e](https://gitlab.pasteur.fr/gaas/GaaS/commit/0771a7ed5e1c218cf08333ba0ca498b5f5186e19)), closes [#110](https://gitlab.pasteur.fr/gaas/GaaS/issues/110) [#111](https://gitlab.pasteur.fr/gaas/GaaS/issues/111)
* **ui:** read an activated workflow's results view from its stored keys ([77abe07](https://gitlab.pasteur.fr/gaas/GaaS/commit/77abe07738094851e3c319500cf16615b8ba72b5)), closes [#56](https://gitlab.pasteur.fr/gaas/GaaS/issues/56) [#59](https://gitlab.pasteur.fr/gaas/GaaS/issues/59) [#59](https://gitlab.pasteur.fr/gaas/GaaS/issues/59)
* **ui:** refresh the results view's analysis on realtime updates ([e633c2e](https://gitlab.pasteur.fr/gaas/GaaS/commit/e633c2ed5c791b73d1ab8977fbe06d5285eef63a)), closes [#52](https://gitlab.pasteur.fr/gaas/GaaS/issues/52) [#52](https://gitlab.pasteur.fr/gaas/GaaS/issues/52) [#58](https://gitlab.pasteur.fr/gaas/GaaS/issues/58)
* **ui:** refuse a name of only spaces in the form, before the round trip ([b36a19e](https://gitlab.pasteur.fr/gaas/GaaS/commit/b36a19e7c47d39b1668d6496e09a112104313abc)), closes [#47](https://gitlab.pasteur.fr/gaas/GaaS/issues/47) [#46](https://gitlab.pasteur.fr/gaas/GaaS/issues/46) [#47](https://gitlab.pasteur.fr/gaas/GaaS/issues/47) [#61](https://gitlab.pasteur.fr/gaas/GaaS/issues/61)
* **ui:** refuse a workflow input the reader never selected ([6de43d3](https://gitlab.pasteur.fr/gaas/GaaS/commit/6de43d3e361f1969413930d090af6ca3a5168956)), closes [#36](https://gitlab.pasteur.fr/gaas/GaaS/issues/36) [#36](https://gitlab.pasteur.fr/gaas/GaaS/issues/36) [#39](https://gitlab.pasteur.fr/gaas/GaaS/issues/39)
* **ui:** refuse an analysis whose name was cleared instead of doing nothing ([dafc055](https://gitlab.pasteur.fr/gaas/GaaS/commit/dafc0559d85cbb1316b3eccb2a2f359da0b2c397)), closes [#36](https://gitlab.pasteur.fr/gaas/GaaS/issues/36)
* **ui:** render a parameter inside a section or a repeat ([4b5a1fa](https://gitlab.pasteur.fr/gaas/GaaS/commit/4b5a1fa759438a3a4964899b8f2fd07719cfe78f)), closes [#101](https://gitlab.pasteur.fr/gaas/GaaS/issues/101) [#97](https://gitlab.pasteur.fr/gaas/GaaS/issues/97) [#113](https://gitlab.pasteur.fr/gaas/GaaS/issues/113) [#114](https://gitlab.pasteur.fr/gaas/GaaS/issues/114)
* **ui:** render a text parameter, and read what the step saved for it ([3deff96](https://gitlab.pasteur.fr/gaas/GaaS/commit/3deff961746750b377af91f3ac8619c4199e3d64)), closes [#113](https://gitlab.pasteur.fr/gaas/GaaS/issues/113) [#111](https://gitlab.pasteur.fr/gaas/GaaS/issues/111)
* **ui:** restore the single definitions the last refactor split ([497fb5b](https://gitlab.pasteur.fr/gaas/GaaS/commit/497fb5b0b66d5df1bfe3502eb7caffccafc30617))
* **ui:** say what a trend bucket covers, not just where it starts ([301a7f4](https://gitlab.pasteur.fr/gaas/GaaS/commit/301a7f4065212486cfe12c2558a6db53cbd39777)), closes [#18](https://gitlab.pasteur.fr/gaas/GaaS/issues/18)
* **ui:** show a hidden stored workflow only once it carries a version ([595da5e](https://gitlab.pasteur.fr/gaas/GaaS/commit/595da5e720575333edb7c09c246e10d2718de8b8))
* **ui:** show a nested parameter value instead of [object Object] ([0ed505f](https://gitlab.pasteur.fr/gaas/GaaS/commit/0ed505f99b82aaed4f12f9bb63c782672666456a)), closes [#87](https://gitlab.pasteur.fr/gaas/GaaS/issues/87)
* **ui:** show the reader what the server refused a submission for ([9f89e53](https://gitlab.pasteur.fr/gaas/GaaS/commit/9f89e535ee040953d496acdf5e169ea730cf0c99)), closes [#43](https://gitlab.pasteur.fr/gaas/GaaS/issues/43) [#43](https://gitlab.pasteur.fr/gaas/GaaS/issues/43) [#46](https://gitlab.pasteur.fr/gaas/GaaS/issues/46)
* **ui:** size a step by its anchors [#122](https://gitlab.pasteur.fr/gaas/GaaS/issues/122) ([34056c5](https://gitlab.pasteur.fr/gaas/GaaS/commit/34056c51fb703c6cf73b4bbeb49c899395e5f3d1))
* **ui:** stop the dataset picker offering to create a dataset ([31bc4d1](https://gitlab.pasteur.fr/gaas/GaaS/commit/31bc4d118ce78659a62dc83741dfa340881456c9)), closes [#39](https://gitlab.pasteur.fr/gaas/GaaS/issues/39) [#44](https://gitlab.pasteur.fr/gaas/GaaS/issues/44)
* **ui:** stop Vite pre-bundling blendtype in dev ([c11ad13](https://gitlab.pasteur.fr/gaas/GaaS/commit/c11ad13dbaa45aa4d0d35062ef8efe884579256b))
* **ui:** submit a conditional's zero and empty-string parameters ([fc65074](https://gitlab.pasteur.fr/gaas/GaaS/commit/fc65074fd700ffe1f01d555a8b763a8cb01967a1)), closes [#95](https://gitlab.pasteur.fr/gaas/GaaS/issues/95) [#95](https://gitlab.pasteur.fr/gaas/GaaS/issues/95)
* **ui:** submit and read back a nested parameter at any depth ([a0fcc7b](https://gitlab.pasteur.fr/gaas/GaaS/commit/a0fcc7b564ce905f7439f486c9bfc74c9a4f0f60)), closes [#98](https://gitlab.pasteur.fr/gaas/GaaS/issues/98) [#101](https://gitlab.pasteur.fr/gaas/GaaS/issues/101) [#101](https://gitlab.pasteur.fr/gaas/GaaS/issues/101)
* **ui:** surface a refused analysis submission instead of discarding it ([b053b7a](https://gitlab.pasteur.fr/gaas/GaaS/commit/b053b7aa346d493eac739c1971f6f9cc1b1e107c)), closes [#25](https://gitlab.pasteur.fr/gaas/GaaS/issues/25) [#25](https://gitlab.pasteur.fr/gaas/GaaS/issues/25) [#27](https://gitlab.pasteur.fr/gaas/GaaS/issues/27)
* **usage:** review fixes for the time-range filter ([cddcb54](https://gitlab.pasteur.fr/gaas/GaaS/commit/cddcb5498a0fa878a604a37de7c9be4d44b42013)), closes [#17](https://gitlab.pasteur.fr/gaas/GaaS/issues/17) [#18](https://gitlab.pasteur.fr/gaas/GaaS/issues/18)
* **usage:** review fixes for the trend granularity ([b923cce](https://gitlab.pasteur.fr/gaas/GaaS/commit/b923cceab4d26fceb4671fee80d232b049427abc)), closes [#18](https://gitlab.pasteur.fr/gaas/GaaS/issues/18) [#17](https://gitlab.pasteur.fr/gaas/GaaS/issues/17)
* **usage:** review fixes for the workflow selection ([b728f74](https://gitlab.pasteur.fr/gaas/GaaS/commit/b728f741757cef89d3e73a3def924b4b5f11df87)), closes [#19](https://gitlab.pasteur.fr/gaas/GaaS/issues/19)

## [0.0.4-beta.3](https://gitlab.pasteur.fr/hub/GaaS/compare/v0.0.4-beta.2...v0.0.4-beta.3) (2026-06-03)


### Features

* better error message, display url ([5eb819f](https://gitlab.pasteur.fr/hub/GaaS/commit/5eb819f76daefb4c6758ae9441e2a22a20f95910))
* **upload:** configurable blob upload mode + explicit blendtype upload functions ([3b38266](https://gitlab.pasteur.fr/hub/GaaS/commit/3b38266e208477bf153d1a85d06dc4fbae4dbeb7))


### Bug Fixes

* **build:** broken lock file ([b7ddf41](https://gitlab.pasteur.fr/hub/GaaS/commit/b7ddf4172b04760e25cb990d5a5339146d94520b))
* **type:** set a type for the data in Datamap in order to be used with Object.entries for example ([7570bed](https://gitlab.pasteur.fr/hub/GaaS/commit/7570beddd2808cf9185d88f09d0b430e3468f39a))

## [0.0.4-beta.2](https://gitlab.pasteur.fr/hub/GaaS/compare/v0.0.4-beta.1...v0.0.4-beta.2) (2026-05-22)


### Features

* add codegraph tool ([62f140a](https://gitlab.pasteur.fr/hub/GaaS/commit/62f140a204ec4f97be8b1a89c6ab69d875256a9d))
* **database:** Add a utility script that can seed the database from a json file ([f16c090](https://gitlab.pasteur.fr/hub/GaaS/commit/f16c090b12bc98bda5d0271cf0d3546b1c69d1dc))


### Bug Fixes

* **database:** seed script zod enum ([25bb211](https://gitlab.pasteur.fr/hub/GaaS/commit/25bb2114840bbd4c408bfa79bbb6b3664ed0ba77))

## [0.0.4-beta.1](https://gitlab.pasteur.fr/hub/GaaS/compare/v0.0.4-beta.0...v0.0.4-beta.1) (2026-05-21)


### Bug Fixes

* **tests:** update workflow slug ([99a8c14](https://gitlab.pasteur.fr/hub/GaaS/commit/99a8c14ea1a306bca62b9c6d1b2e756eb3e0b032))
* workflow result component resolution to match how nuxt work ([0a1a0d6](https://gitlab.pasteur.fr/hub/GaaS/commit/0a1a0d6c960209f46192ddb596a35a4a42f53d64))

## [0.0.4-beta.0](https://gitlab.pasteur.fr/hub/GaaS/compare/v0.0.3...v0.0.4-beta.0) (2026-05-19)

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
