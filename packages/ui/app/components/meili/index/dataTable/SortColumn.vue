<script setup lang="ts" generic="T">
import type { Column, SortDirection } from '@tanstack/table-core'

export interface SortColumnProps<T> {
  column: Column<T>
  label?: string
}

const props = defineProps<SortColumnProps<T>>()
const { column, label } = toRefs(props)

const sortedState = computed<SortDirection | false>(() => {
  const isSorted = column.value.getIsSorted()
  return isSorted
})

const icon = computed(() => {
  const isSorted = sortedState.value
  if (!isSorted) {
    return 'i-solar:sort-vertical-linear'
  }
  return isSorted === 'asc' ? 'i-solar:sort-from-top-to-bottom-bold' : 'i-solar:sort-from-bottom-to-top-bold'
})

const buttonUI = computed(() => {
  const isSorted = sortedState.value
  if (!isSorted) {
    return {
      base: 'group hover:bg-transparent dark:hover:bg-transparent hover:cursor-pointer',
      leadingIcon: 'opacity-0 group-hover:opacity-100 transition-opacity',
    }
  }
  return {
    base: 'group hover:bg-transparent dark:hover:bg-transparent hover:cursor-pointer',
    leadingIcon: 'text-primary',
  }
})
</script>

<template>
  <UButton
    color="neutral" variant="ghost" :label :icon :ui="buttonUI" class="-mx-2.5"
    @click="() => column.toggleSorting()"
  />
</template>
