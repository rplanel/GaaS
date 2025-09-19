<script setup lang="ts">
import type { SupabaseTypes } from '#build/types/database'
import type { GalaxyTypes } from '#build/types/nuxt-galaxy'
import { UBadge } from '#components'
import { getHumanSize } from '#layers/@gaas-ui/app/utils'
import { z } from 'zod'

type AnalysisIOsWithStoratePath = GalaxyTypes.AnalysisInputsWithStoratePath | GalaxyTypes.AnalysisOutputsWithStoratePath

export interface Props {
  items?: AnalysisIOsWithStoratePath[] | undefined
}

type Database = SupabaseTypes.Database
const props = withDefaults(defineProps<Props>(), { items: undefined })
const supabase = useSupabaseClient<Database>()
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

async function downloadFile(storageId: string | null) {
  if (!storageId) {
    throw createError('Storage ID is missing')
  }
  const { data: storageObject } = await supabase
    .schema('storage')
    .from('objects')
    .select()
    .eq('id', storageId)
    .limit(1)
    .single()
  if (storageObject && storageObject?.name) {
    const { data } = await supabase.storage
      .from('analysis_files')
      .download(storageObject.name)
    const a = document.createElement('a')

    if (data) {
      document.body.appendChild(a)
      a.setAttribute('style', 'display: none')

      const url = window.URL.createObjectURL(data)
      a.href = url
      const filename = storageObject.name.split('/')[1]
      if (filename) {
        a.download = filename
        a.click()
      }
      window.URL.revokeObjectURL(url)
    }
  }
}
</script>

<template>
  <div>
    <UPageList>
      <UPageCard
        v-for="(dataset, i) in sanitizedItems" :key="dataset?.dataset_name ?? i"
        :description="dataset?.dataset_name ? dataset.dataset_name : undefined"
        variant="ghost"
        icon="i-mdi:download"
        @click="downloadFile(dataset?.storage_object_id)"
      >
        <template #footer>
          <div class="flex flex-row gap-1 text-sm text-gray-500">
            <UBadge v-if="dataset.humanFileSize" class="font-bold rounded-full">
              {{ dataset.humanFileSize }}
            </UBadge>
            <UBadge v-if="dataset?.misc_blurb" class="font-bold rounded-full" variant="text" color="neutral">
              {{ dataset.misc_blurb }}
            </UBadge>
          </div>
        </template>
      </UPageCard>
    </UPageList>
  </div>
</template>
