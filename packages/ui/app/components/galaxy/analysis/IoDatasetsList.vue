<script setup lang="ts">
import type { AnalysisInputWithStoragePathRow, AnalysisOutputWithStoragePathRow } from 'nuxt-galaxy'
import { getHumanSize } from '#layers/@gaas-ui/app/utils'
import * as z from 'zod'

type AnalysisIOsWithStoratePath = AnalysisInputWithStoragePathRow | AnalysisOutputWithStoragePathRow

export interface Props {
  items?: AnalysisIOsWithStoratePath[] | undefined
  resultRoutes?: Record<string, string>
}

export type AnalysisIOsWithStoratePathAndSize = AnalysisIOsWithStoratePath & { humanFileSize: string }

const props = withDefaults(defineProps<Props>(), { items: undefined, resultRoutes: undefined })
const items = toRef(() => props.items)
const fileMetadataSchema = z.object({
  size: z.number(),
})
const sanitizedItems = computed(() => {
  const itemsVal = toValue(items)

  if (itemsVal) {
    return itemsVal
      .filter(item => item?.metadata)
      .map((item) => {
        const { size } = fileMetadataSchema.passthrough().parse(item.metadata)

        return {
          ...item,
          humanFileSize: getHumanSize(size),
        }
      })
  }
  return []
})
</script>

<template>
  <div class="space-y-3">
    <div v-if="sanitizedItems.length > 0" class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-files" class="size-4" />
      <span>{{ sanitizedItems.length }} dataset{{ sanitizedItems.length !== 1 ? 's' : '' }}</span>
    </div>
    <div v-if="sanitizedItems.length > 0" class="space-y-2">
      <GalaxyAnalysisIoDataset
        v-for="(dataset, i) in sanitizedItems"
        :key="dataset?.dataset_name ?? i"
        :dataset="dataset"
        :result-route="resultRoutes?.[dataset.dataset_name ?? '']"
      />
    </div>
    <div v-else class="text-sm text-muted py-4 text-center">
      No datasets available.
    </div>
  </div>
</template>
