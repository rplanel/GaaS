<script setup lang="ts">
import type { AnalysisIOsWithStoratePathAndSize } from './IoDatasetsList.vue'
import { getFileTypeInfo } from '#layers/@gaas-ui/app/utils/fileTypeIcon'

interface Props {
  dataset: AnalysisIOsWithStoratePathAndSize
  resultRoute?: string
  isPreviewOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), { resultRoute: undefined, isPreviewOpen: false })
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

async function handleDownload() {
  const datasetVal = toValue(dataset)
  if (!datasetVal)
    return

  emit('download', datasetVal)
}
</script>

<template>
  <UPageCard
    variant="outline" :highlight="isPreviewOpen" :icon="fileType.icon"
    :ui="{
      wrapper: 'min-w-0 overflow-hidden w-full',
    }"
  >
    <template #title>
      <h3
        class="text-base font-semibold text-highlighted truncate block min-w-0"
        :title="dataset?.dataset_name || 'Unknown Dataset'"
      >
        {{ dataset?.dataset_name || 'Unknown Dataset' }}
      </h3>
    </template>

    <template #description>
      <div class="flex flex-wrap items-center gap-2 text-xs text-muted mt-2">
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
    </template>

    <template #footer>
      <div class="flex items-center gap-2 justify-end">
        <UButton
          v-if="resultRoute" icon="i-lucide-chart-no-axes-combined" color="primary" variant="ghost" size="xs"
          label="Results" :to="resultRoute"
        />
        <UButton
          v-if="hasPreview" :icon="isPreviewOpen ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :color="isPreviewOpen ? 'primary' : 'neutral'" variant="soft" size="xs"
          :label="isPreviewOpen ? 'Close' : 'Preview'" @click="emit('togglePreview')"
        />
        <UButton
          icon="i-lucide-download" color="primary" variant="soft" size="xs" label="Download"
          @click="handleDownload"
        />
      </div>
    </template>
  </UPageCard>
</template>
