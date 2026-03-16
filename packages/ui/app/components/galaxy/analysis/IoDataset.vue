<script setup lang="ts">
import type { AnalysisIOsWithStoratePathAndSize } from './IoDatasetsList.vue'

interface Props {
  dataset: AnalysisIOsWithStoratePathAndSize
}
const props = withDefaults(defineProps<Props>(), {})
const dataset = toRef(() => props.dataset)

const datasetStoragePath = computed(() => {
  const datasetVal = toValue(dataset)
  return datasetVal?.storage_path ?? undefined
})

const { storagePath, data: fileBlob, refetch } = useDownloadDataset()

async function handleDownload() {
  const datasetStoragePathVal = toValue(datasetStoragePath)
  if (datasetStoragePathVal) {
    storagePath.value = datasetStoragePathVal
    await refetch()
    // Now create browser download
    const fileBlobVal = toValue(fileBlob)
    if (fileBlobVal) {
      const url = URL.createObjectURL(fileBlobVal)
      const a = document.createElement('a')
      a.href = url
      a.download = storagePath.value.split('/').pop() || 'download'
      a.click()
      URL.revokeObjectURL(url)
    }
  }
  else {
    console.error('Dataset storage path is missing')
  }
}
</script>

<template>
  <UPageCard
    :description="dataset?.dataset_name ? dataset.dataset_name : undefined"
    variant="ghost"
    icon="i-mdi:download"
    @click="handleDownload"
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
</template>
