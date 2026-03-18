<script setup lang="ts">
import type { AnalysisInputWithStoragePathRow, AnalysisOutputWithStoragePathRow } from 'nuxt-galaxy'
import { getHumanSize } from '#layers/@gaas-ui/app/utils'
import * as z from 'zod'

type AnalysisIOsWithStoratePath = AnalysisInputWithStoragePathRow | AnalysisOutputWithStoragePathRow

export interface Props {
  items?: AnalysisIOsWithStoratePath[] | undefined
}

export type AnalysisIOsWithStoratePathAndSize = AnalysisIOsWithStoratePath & { humanFileSize: string }

const props = withDefaults(defineProps<Props>(), { items: undefined })
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
  <div>
    <UPageList divide>
      <GalaxyAnalysisIoDataset
        v-for="(dataset, i) in sanitizedItems" :key="dataset?.dataset_name ?? i"
        :dataset="dataset"
      />
    </UPageList>
  </div>
</template>
