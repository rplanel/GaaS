<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import { findPageHeadline } from '@nuxt/content/utils'

definePageMeta({ layout: 'article' })

const route = useRoute()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const { data: page } = await useAsyncData(route.path, () => {
  return queryCollection('content').path(route.path).first()
})
if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}
const { data: surround } = await useAsyncData(`${route.path}-surround`, () => {
  return queryCollectionItemSurroundings('content', route.path, {
    fields: ['description'],
  })
})

const headline = computed(() => navigation?.value ? findPageHeadline(navigation.value, page.value) : undefined)
</script>

<template>
  <div>
    <UPage v-if="page">
      <UPageHeader
        :title="page.title"
        :description="page.description"
        :headline="headline"
      />
      <UPageBody>
        <ContentRenderer
          v-if="page"
          :value="page"
        />
        <USeparator />
        <UContentSurround :surround="surround" />
      </UPageBody>
      <template #right>
        <UContentToc
          v-if="page.body?.toc"
          :links="page.body.toc.links"
        />
      </template>
    </UPage>
  </div>
</template>
