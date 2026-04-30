<script setup lang="ts">
import type { AnalysisInputWithStoragePathRow, AnalysisOutputWithStoragePathRow } from 'nuxt-galaxy'
import { getHumanSize } from '#layers/@gaas-ui/app/utils'
import DOMPurify from 'isomorphic-dompurify'
import { motion } from 'motion-v'
import * as z from 'zod'

type AnalysisIOsWithStoratePath = AnalysisInputWithStoragePathRow | AnalysisOutputWithStoragePathRow

export interface Props {
  items?: AnalysisIOsWithStoratePath[] | undefined
  resultRoutes?: Record<string, { tag: string, to: string }>
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

const openPreviews = ref<Set<number>>(new Set())

function togglePreview(index: number) {
  const newSet = new Set(openPreviews.value)
  if (newSet.has(index)) {
    newSet.delete(index)
  }
  else {
    newSet.add(index)
  }
  openPreviews.value = newSet
}

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

function getHasPreviewContent(dataset: AnalysisIOsWithStoratePathAndSize): boolean {
  return !!getSanitizedPeek(dataset)
}

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
      v-if="sanitizedItems.length > 0"
      :ui="{
        base: 'items-start sm:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3',
        // base: 'grid-flow-dense items-start sm:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3',
      }"
    >
      <motion.div
        v-for="(dataset, i) in sanitizedItems"
        :key="dataset?.id ?? i"
        layout
        :class="{
          'col-span-1': !openPreviews.has(i) || !getHasPreviewContent(dataset),
          'lg:col-span-2 2xl:col-span-3': openPreviews.has(i) && getHasPreviewContent(dataset),
        }"
        :transition="{ type: 'spring', stiffness: 300, damping: 30 }"
        class="h-full"
      >
        <GalaxyAnalysisIoDataset
          :dataset="dataset"
          :result-route="resultRoutes?.[dataset?.id]"
          :is-preview-open="openPreviews.has(i)"
          :preview-content="getHasPreviewContent(dataset) ? getSanitizedPeek(dataset) : ''"
          @toggle-preview="togglePreview(i)"
          @download="handleDownload"
        />
      </motion.div>
    </UPageGrid>

    <div v-else class="text-sm text-muted py-4 text-center">
      No datasets available.
    </div>
  </div>
</template>
