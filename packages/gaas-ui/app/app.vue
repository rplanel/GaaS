<script setup lang="ts">
import { useState } from '#imports'

const appConfig = useAppConfig()

// const highlight = ref(true)
useHead({
  meta: [
    { charset: 'utf-8' },

    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
  ],

  htmlAttrs: {
    lang: 'en',
  },
})

useSeoMeta({
  ...appConfig?.gaasUi.seo,
})
useState('showWorkflowStepParameter', () => true)
</script>

<template>
  <UApp>
    <!-- <Banner /> -->
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
