<script setup lang="ts">
import type { BreadcrumbItem, PageHeaderProps } from '@nuxt/ui'

interface Props {
  breadcrumbsItems?: BreadcrumbItem[] | undefined
  pageHeaderProps?: PageHeaderProps
  icon?: string
}

const props = withDefaults(defineProps<Props>(), {
  pageHeaderProps: () => ({
    title: 'Title',
    description: 'A description',

  }),
  breadcrumbsItems: undefined,

})
const breadcrumbsItems = toRef(() => props.breadcrumbsItems)
</script>

<template>
  <div>
    <div v-if="breadcrumbsItems" class="py-4">
      <UBreadcrumb :items="breadcrumbsItems" />
    </div>
    <UPageHeader v-bind="pageHeaderProps" />
  </div>
</template>
