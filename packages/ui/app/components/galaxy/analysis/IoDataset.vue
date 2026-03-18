<script setup lang="ts">
import type { AnalysisIOsWithStoratePathAndSize } from './IoDatasetsList.vue'
import { getFileTypeInfo } from '#layers/@gaas-ui/app/utils/fileTypeIcon'
import DOMPurify from 'isomorphic-dompurify'

interface Props {
  dataset: AnalysisIOsWithStoratePathAndSize
  resultRoute?: string
}
const props = withDefaults(defineProps<Props>(), { resultRoute: undefined })
const dataset = toRef(() => props.dataset)

interface GalaxyMetadata {
  extension?: string
  data_lines?: number
  misc_blurb?: string
  peek?: string
}

const galaxyMeta = computed(() => dataset.value?.galaxy_metadata as GalaxyMetadata | null | undefined)
const fileExtension = computed(() => galaxyMeta.value?.extension)
const fileType = computed(() => getFileTypeInfo(fileExtension.value))
const dataLines = computed(() => galaxyMeta.value?.data_lines)

// Sanitize peek content safely using DOMPurify (for non-tabular files)
const sanitizedPeek = computed(() => {
  const peek = galaxyMeta.value?.peek
  if (!peek)
    return ''

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
const hasPreview = computed(() => !!sanitizedPeek.value)

const { storagePath, data: fileBlob, refetch } = useDownloadDataset()

async function handleDownload() {
  const datasetStoragePathVal = toValue(datasetStoragePath)
  if (datasetStoragePathVal) {
    storagePath.value = datasetStoragePathVal
    await refetch()
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
}
</script>

<template>
  <div class="rounded-lg border border-default hover:border-accented transition-colors">
    <!-- Card header -->
    <div class="flex items-center gap-3 p-4">
      <!-- File type icon -->
      <div class="shrink-0">
        <UIcon :name="fileType.icon" :class="fileType.color" class="size-6" />
      </div>

      <!-- Dataset info -->
      <div class="flex-1 min-w-0">
        <h3 class="font-medium text-sm truncate" :title="dataset?.dataset_name || undefined">
          {{ dataset?.dataset_name || 'Unknown Dataset' }}
        </h3>
        <div class="flex items-center gap-2 mt-1 flex-wrap">
          <UBadge v-if="fileExtension" variant="subtle" color="neutral" size="xs">
            {{ fileExtension }}
          </UBadge>
          <span v-if="dataset?.humanFileSize" class="text-xs text-muted">
            {{ dataset.humanFileSize }}
          </span>
          <span v-if="dataLines" class="text-xs text-muted">
            {{ dataLines.toLocaleString() }} lines
          </span>
          <span v-if="galaxyMeta?.misc_blurb" class="text-xs text-muted">
            {{ galaxyMeta.misc_blurb }}
          </span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-1 shrink-0">
        <UButton
          v-if="resultRoute"
          icon="i-lucide-chart-no-axes-combined"
          color="primary"
          variant="ghost"
          size="xs"
          label="Results"
          :to="resultRoute"
        />
        <UButton
          v-if="hasPreview"
          :icon="isPreviewOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          color="neutral"
          variant="ghost"
          size="xs"
          :label="isPreviewOpen ? 'Hide' : 'Preview'"
          @click="isPreviewOpen = !isPreviewOpen"
        />
        <UButton
          icon="i-lucide-download"
          color="primary"
          variant="soft"
          size="xs"
          label="Download"
          @click="handleDownload"
        />
      </div>
    </div>

    <!-- Expandable preview panel -->
    <UCollapsible v-model:open="isPreviewOpen" :unmount-on-hide="true">
      <template #content>
        <div class="border-t border-default">
          <div
            v-if="sanitizedPeek"
            class="file-preview text-xs font-mono bg-muted p-4 overflow-x-auto max-h-80 overflow-y-auto"
            v-html="sanitizedPeek"
          />
        </div>
      </template>
    </UCollapsible>
  </div>
</template>
