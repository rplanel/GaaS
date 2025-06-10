<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'

interface Props {
  column: Column<any>
  label: string
}

const props = withDefaults(defineProps<Props>(), {})
const column = toRef(() => props.column)
const label = toRef(() => props.label)

const isSorted = computed(() => {
  const columnVal = toValue(column)
  return columnVal.getIsSorted()
})
const items = computed<DropdownMenuItem[]>(() => {
  const isSortedVal = toValue(isSorted)
  const columnVal = toValue(column)
  return [
    {
      label: 'Asc',
      type: 'link',
      icon: 'i-lucide-arrow-up-narrow-wide',
      checked: isSortedVal === 'asc',
      onSelect: () => {
        if (isSortedVal === 'asc') {
          columnVal.clearSorting()
        }
        else {
          columnVal.toggleSorting(false)
        }
      },
    },
    {
      label: 'Desc',
      icon: 'i-lucide-arrow-down-wide-narrow',
      type: 'link',
      checked: isSortedVal === 'desc',
      onSelect: () => {
        if (isSortedVal === 'desc') {
          columnVal.clearSorting()
        }
        else {
          columnVal.toggleSorting(true)
        }
      },
    },
  ]
})

const sortedIcon = computed(() => {
  const isSortedVal = toValue(isSorted)

  return isSortedVal
    ? isSortedVal === 'asc'
      ? 'i-lucide-arrow-up-narrow-wide'
      : 'i-lucide-arrow-down-wide-narrow'
    : 'i-lucide-arrow-up-down'
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    class
  >
    <UButton
      variant="ghost"
      color="neutral"
      :icon="sortedIcon"
      :label
      class="-mx-2.5 data-[state=open]:bg-[var(--ui-bg-elevated)] py-0"
    />
  </UDropdownMenu>
</template>
