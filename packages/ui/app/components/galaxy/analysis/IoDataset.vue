<script setup lang="ts">
import type { AnalysisIOsWithStoratePathAndSize } from './IoDatasetsList.vue'
import { getFileTypeInfo } from '#layers/@gaas/ui/app/utils/fileTypeIcon'
import DOMPurify from 'isomorphic-dompurify'

interface Props {
  dataset: AnalysisIOsWithStoratePathAndSize
  isPreviewOpen?: boolean
}
const props = withDefaults(defineProps<Props>(), { isPreviewOpen: false })
const emit = defineEmits<{
  (e: 'togglePreview'): void
  (e: 'download', dataset: AnalysisIOsWithStoratePathAndSize): void
}>()

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

const hasPreview = computed(() => !!sanitizedPeek.value)
</script>

<template>
  <UCard variant="soft" class="h-full">
    <!-- Header: Full width title + metadata -->
    <template #header>
      <div class="flex items-start gap-3">
        <!-- File type icon -->
        <UIcon :name="fileType.icon" :class="fileType.color" class="size-6 shrink-0" />

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
      </div>
    </template>

    <template v-if="isPreviewOpen && sanitizedPeek" #default>
      <!-- Body: Preview content (only when open + has content) -->
      <div
        class="file-preview text-xs font-mono bg-muted p-4 overflow-x-auto max-h-80 overflow-y-auto"
        v-html="sanitizedPeek"
      />
    </template>
    <!-- Footer: Actions at bottom -->
    <template #footer>
      <div class="flex items-center justify-end gap-1">
        <UButton
          v-if="hasPreview" :icon="isPreviewOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          color="neutral" variant="ghost" size="xs" label="Preview" @click="emit('togglePreview')"
        />
        <UButton
          icon="i-lucide-download" color="primary" variant="soft" size="xs" label="Download"
          @click="emit('download', dataset)"
        />
      </div>
    </template>
  </UCard>
</template>
