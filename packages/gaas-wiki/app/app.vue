<script setup lang="ts">
import { useAppConfig, useAsyncData, useHead, useLazyAsyncData, useSeoMeta } from 'nuxt/app'
import { computed, provide, ref } from 'vue'

const { gaasWiki: { seo } } = useAppConfig()

const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('content'))
const { data: files } = useLazyAsyncData('search', () => queryCollectionSearchSections('content'), {
  server: false,
})
// const { navigationMenuItems } = useNavigationMenuItems({ wiki, navigationMenuItems: navigationMenuItemsFromConfig })

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
  ],
  htmlAttrs: {
    lang: 'en',
  },
})
useSeoMeta({
  ...seo,
})

const links = computed(() => {
  return []
  // return toValue(navigationMenuItems).map((item) => {
  //   return {
  //     label: item.label,
  //     icon: item.icon,
  //     to: item.to,
  //   }
  // })
})

const searchTerm = ref('')

provide('navigation', navigation)
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />
    <ClientOnly>
      <LazyUContentSearch
        v-model:search-term="searchTerm"
        :files="files"
        shortcut="meta_k"
        :navigation="navigation"
        :links="links"
        :fuse="{ resultLimit: 42 }"
      />
    </ClientOnly>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
