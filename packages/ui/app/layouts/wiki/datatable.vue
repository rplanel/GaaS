<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import type { Ref } from 'vue'
import { inject } from 'vue'

const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const rootNavigation = computed(() => {
  if (!navigation?.value) {
    return []
  }

  if (!navigation.value[0]?.children || navigation.value[0]?.children.length === 0) {
    return navigation.value
  }
  // remove the first level which is just a container
  return navigation.value[0]?.children || []
})
</script>

<template>
  <AppHeader />
  <div class="w-full mx-auto px-4 sm:px-6 lg:px-8">
    <UPage>
      <template #left>
        <UPageAside>
          <template #top>
            <UContentSearchButton :collapsed="false" />
          </template>
          <UContentNavigation
            highlight
            :navigation="rootNavigation || []"
          />
        </UPageAside>
      </template>
      <slot />
    </UPage>
  </div>
</template>
