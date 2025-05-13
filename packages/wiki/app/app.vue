<script setup lang="ts">
import type { SupabaseTypes } from '#build/types/database'
import { useNavigationMenuItems } from '@gaas/ui/app/composables/useNavigationMenuItems'
import { useAppConfig, useAsyncData, useHead, useLazyAsyncData, useSeoMeta } from 'nuxt/app'
import { computed, provide, ref } from 'vue'

type Database = SupabaseTypes.Database

const { gaasUi: { seo, navigationMenuItems: navigationMenuItemsFromConf } } = useAppConfig()

const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('content'))
const { data: files } = useLazyAsyncData('search', () => queryCollectionSearchSections('content'), {
  server: false,
})

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
const supabase = useSupabaseClient<Database>()
const { userRole } = useUserRole(supabase)
const { navigationMenuItems } = useNavigationMenuItems({ navigationMenuItems: navigationMenuItemsFromConf, userRole })

const links = computed(() => {
  return toValue(navigationMenuItems).map((item) => {
    return {
      label: item.label,
      icon: item.icon,
      to: item.to,
    }
  })
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
