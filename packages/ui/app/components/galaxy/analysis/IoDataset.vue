<script setup lang="ts">
import type { AnalysisIOsWithStoratePathAndSize } from './IoDatasetsList.vue'
import { getFileTypeInfo } from '#layers/@gaas-ui/app/utils/fileTypeIcon'
import { motion } from 'motion-v'

interface Props {
  dataset: AnalysisIOsWithStoratePathAndSize
  resultRoute?: { tag: string, to: string }
  isPreviewOpen?: boolean
  previewContent?: string
}

const props = withDefaults(defineProps<Props>(), { resultRoute: undefined, isPreviewOpen: false, previewContent: '' })
const emit = defineEmits<{
  (e: 'togglePreview'): void
  (e: 'download', payload: typeof dataset.value): void
}>()

const dataset = toRef(() => props.dataset)

interface GalaxyMetadata {
  extension?: string
  data_lines?: number
  misc_blurb?: string
}

const galaxyMeta = computed(() => dataset.value?.galaxy_metadata as GalaxyMetadata | null | undefined)
const fileExtension = computed(() => galaxyMeta.value?.extension)
const fileType = computed(() => getFileTypeInfo(fileExtension.value))
const dataLines = computed(() => galaxyMeta.value?.data_lines)
const hasPreview = computed(() => !!galaxyMeta.value?.extension)
const hasTag = computed(() => !!props.resultRoute?.tag)
const title = computed(() => props.resultRoute?.tag || dataset.value?.dataset_name || 'Unknown Dataset')
const fullName = computed(() => hasTag.value ? dataset.value?.dataset_name || 'Unknown Dataset' : null)

async function handleDownload() {
  const datasetVal = toValue(dataset)
  if (!datasetVal)
    return

  emit('download', datasetVal)
}
</script>

<template>
  <motion.div layout class="h-full">
    <UPageCard
      variant="outline" :icon="fileType.icon"
      :ui="{
        wrapper: 'min-w-0 overflow-hidden w-full h-full',
      }"
    >
      <template #title>
        <h3 class="text-base font-semibold text-highlighted truncate block min-w-0">
          {{ title }}
        </h3>
      </template>

      <template #description>
        <div v-if="fullName" class="text-sm text-muted mb-1">
          {{ fullName }}
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
          <UBadge v-if="fileExtension" variant="subtle" color="neutral" size="xs">
            {{ fileExtension }}
          </UBadge>
          <span v-if="dataset?.humanFileSize">
            {{ dataset.humanFileSize }}
          </span>
          <span v-if="dataLines">
            {{ dataLines.toLocaleString() }} lines
          </span>
          <span v-if="galaxyMeta?.misc_blurb">
            {{ galaxyMeta.misc_blurb }}
          </span>
        </div>
        <div
          v-if="isPreviewOpen && previewContent"
          class="file-preview text-xs font-mono p-4 overflow-x-auto max-h-80 overflow-y-auto overflow-hidden border-t border-default mt-4"
          v-html="previewContent"
        />
      </template>

      <template #footer>
        <div class="flex items-center gap-2 justify-end">
          <UButton
            v-if="resultRoute" icon="i-lucide-chart-no-axes-combined" color="primary" variant="ghost" size="xs"
            label="Results" :to="resultRoute?.to"
          />
          <UButton
            v-if="hasPreview" :icon="isPreviewOpen ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :color="isPreviewOpen ? 'primary' : 'neutral'" variant="soft" size="xs"
            :label="isPreviewOpen ? 'Hide Preview' : 'Preview'" @click="emit('togglePreview')"
          />
          <UButton
            icon="i-lucide-download" color="primary" variant="soft" size="xs" label="Download"
            @click="handleDownload"
          />
        </div>
      </template>
    </UPageCard>
  </motion.div>
</template>
