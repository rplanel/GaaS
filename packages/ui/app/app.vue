<script setup lang="ts">
import { PiniaColadaDevtools } from '@pinia/colada-devtools'

const { gaasUi: { seo } } = useAppConfig()
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
  twitterCard: 'summary_large_image',
  ogSiteName: seo?.siteName,
  titleTemplate: `%s - ${seo?.siteName}`,
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
  <PiniaColadaDevtools />
</template>
