<script setup lang="ts">
import type { AnalysisIOsWithStoratePathAndSize } from './IoDatasetsList.vue'
import DOMPurify from 'isomorphic-dompurify'

interface Props {
  dataset: AnalysisIOsWithStoratePathAndSize
}
const props = withDefaults(defineProps<Props>(), {})
const dataset = toRef(() => props.dataset)

// Sanitize peek content safely using DOMPurify
const sanitizedPeek = computed(() => {
  const peek = dataset.value?.galaxy_metadata?.peek
  if (!peek)
    return ''

  // Configure DOMPurify for file previews with safe HTML tags
  return DOMPurify.sanitize(peek, {
    ALLOWED_TAGS: [
      'div',
      'span',
      'p',
      'br',
      'hr',
      'pre',
      'code',
      'samp',
      'kbd',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'b',
      'i',
      'em',
      'strong',
      'small',
      'sub',
      'sup',
    ],
    ALLOWED_ATTR: ['class', 'style'],
    KEEP_CONTENT: true,
  })
})

const datasetStoragePath = computed(() => {
  const datasetVal = toValue(dataset)
  return datasetVal?.storage_path ?? undefined
})

const isPreviewOpen = ref(false)

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
  <UPageCard variant="ghost">
    <div class="flex items-center justify-between gap-2">
      <div class="flex-1 min-w-0">
        <h3 class="font-medium text-sm truncate">
          {{ dataset?.dataset_name || 'Unknown Dataset' }}
        </h3>
      </div>
      <div class="flex items-center gap-2">
        <!-- Preview toggle button -->
        <UButton
          v-if="sanitizedPeek"
          :icon="isPreviewOpen ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          color="neutral"
          variant="ghost"
          size="xs"
          :label="isPreviewOpen ? 'Hide Preview' : 'Show Preview'"
          @click="isPreviewOpen = !isPreviewOpen"
        />
        <!-- Download button -->
        <UButton
          icon="i-mdi:download"
          color="primary"
          variant="ghost"
          size="xs"
          label="Download"
          @click="handleDownload"
        />
      </div>
    </div>

    <!-- File Preview with UCollapsible -->
    <UCollapsible v-model:open="isPreviewOpen" class="mt-2" :unmount-on-hide="false">
      <template #content>
        <div
          v-if="sanitizedPeek"
          class="file-preview text-xs font-mono bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-x-auto max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700"
          v-html="sanitizedPeek"
        />
      </template>
    </UCollapsible>

    <!-- Footer with metadata -->
    <div class="flex flex-row gap-2 mt-2 text-sm text-gray-500">
      <UBadge v-if="dataset?.humanFileSize" class="font-bold rounded-full">
        {{ dataset.humanFileSize }}
      </UBadge>
      <UBadge
        v-if="dataset?.galaxy_metadata?.misc_blurb"
        class="font-bold rounded-full"
        variant="text"
        color="neutral"
      >
        {{ dataset.galaxy_metadata.misc_blurb }}
      </UBadge>
    </div>
  </UPageCard>
</template>
