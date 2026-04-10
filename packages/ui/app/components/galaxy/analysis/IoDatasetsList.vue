<script setup lang="ts">
import type { AnalysisInputWithStoragePathRow, AnalysisOutputWithStoragePathRow } from 'nuxt-galaxy'
import { getHumanSize } from '#layers/@gaas-ui/app/utils'
import DOMPurify from 'isomorphic-dompurify'
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

const previewOpenIndex = ref<number | null>(null)

function togglePreview(index: number) {
  if (previewOpenIndex.value === index) {
    previewOpenIndex.value = null
  }
  else {
    previewOpenIndex.value = index
  }
}

const previewDataset = computed(() => {
  if (previewOpenIndex.value === null)
    return null
  return sanitizedItems.value[previewOpenIndex.value]
})

function getSanitizedPeek(dataset: AnalysisIOsWithStoratePathAndSize | null): string {
  if (!dataset)
    return ''

  interface GalaxyMetadata {
    peek?: string
  }
  const galaxyMeta = dataset.galaxy_metadata as GalaxyMetadata | null | undefined
  const peek = galaxyMeta?.peek

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
}

const sanitizedPreviewContent = computed(() => {
  return getSanitizedPeek(previewDataset.value)
})

const hasPreviewContent = computed(() => {
  return !!sanitizedPreviewContent.value
})

const { storagePath, state: fileBlob } = useDownloadDataset()

async function handleDownload(payload: AnalysisIOsWithStoratePathAndSize | undefined) {
  if (!payload?.storage_path)
    return

  storagePath.value = payload.storage_path
  const result = await fileBlob.refetch()

  if (result.status === 'success' && result.data?.data) {
    const url = URL.createObjectURL(result.data.data)
    const a = document.createElement('a')
    a.href = url
    a.download = payload.storage_path.split('/').pop() || 'download'
    a.click()
    URL.revokeObjectURL(url)
  }
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="sanitizedItems.length > 0" class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-files" class="size-4" />
      <span>{{ sanitizedItems.length }} dataset{{ sanitizedItems.length !== 1 ? 's' : '' }}</span>
    </div>

    <UPageGrid
      v-if="sanitizedItems.length > 0" :ui="{
        base: 'sm:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3',
      }"
    >
      <template v-for="(dataset, i) in sanitizedItems" :key="dataset?.dataset_name ?? i">
        <GalaxyAnalysisIoDataset
          :dataset="dataset"
          :result-route="resultRoutes?.[dataset?.dataset_name ?? '']"
          :is-preview-open="previewOpenIndex === i"
          @toggle-preview="togglePreview(i)"
          @download="handleDownload"
        />

        <UPageCard
          v-if="previewOpenIndex === i && hasPreviewContent"
          variant="outline"
          :ui="{
            container: 'grid-cols-1',
          }"
          class="col-span-1 sm:col-span-2 lg:col-span-3"
        >
          <div
            class="file-preview text-xs font-mono p-4 overflow-x-auto max-h-80 overflow-y-auto"
            v-html="sanitizedPreviewContent"
          />
        </UPageCard>
      </template>
    </UPageGrid>

    <div v-else class="text-sm text-muted py-4 text-center">
      No datasets available.
    </div>
  </div>
</template>
