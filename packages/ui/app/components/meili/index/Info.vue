<script lang="ts" setup>
import { useMeiliIndex } from '../../../composables/meili/useMeiliIndex'

interface Props {
  indexName: string
}

const props = defineProps<Props>()

const meiliIndex = toRef(() => props.indexName)

const { info, settings, stats } = useMeiliIndex({
  index: meiliIndex,
})

const items = [
  { id: 'info', label: 'Info', data: info },
  { id: 'settings', label: 'Settings', data: settings },
  { id: 'stats', label: 'Stats', data: stats },
]
</script>

<template>
  <UCard class="p-4 mb-4">
    <template #header>
      <h3 class="text-lg font-medium">
        {{ meiliIndex }} Index Information
      </h3>
    </template>
    <UAccordion :items="items">
      <template #body="{ item }">
        <pre>{{ item.data }}</pre>
      </template>
    </UAccordion>
  </UCard>
</template>
