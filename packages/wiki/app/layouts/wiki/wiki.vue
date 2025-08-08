<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import type { Ref } from 'vue'
import { inject } from 'vue'

const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')
</script>

<template>
  <AppHeader />
  <UContainer>
    <UPage>
      <template #left>
        <UPageAside>
          <template #top>
            <UContentSearchButton :collapsed="false" />
          </template>
          <UContentNavigation
            highlight
            :navigation="navigation"
          />
        </UPageAside>
      </template>
      <slot />
    </UPage>
  </UContainer>
</template>
