<script setup lang="ts">
import type { AnalysisIOsWithStoratePathAndSize } from './IoDatasetsList.vue'
import { getFileTypeInfo } from '#layers/@gaas-ui/app/utils/fileTypeIcon'
import { AnimatePresence, motion, Motion } from 'motion-v'

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
const { isSmallDesktopOrMobile } = useDefinedBreakpoints()

const previewEl = useTemplateRef('previewEl')
// const { style } = useScrollShadow(previewEl, { orientation: 'horizontal' })

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
  <motion.div layout>
    <UPageCard
      :ui="{
        root: 'min-w-0 overflow-hidden',
        body: 'min-w-0 overflow-auto',
        wrapper: 'overflow-auto',
        description: 'overflow-auto',
        header: 'w-full',
      }"
    >
      <template #header>
        <div class="flex justify-between">
          <div v-if="!isSmallDesktopOrMobile" class="flex items-center">
            <UIcon :name="fileType.icon" color="primary" size="20" class="text-primary" />
          </div>
          <div class="flex gap-2 justify-end w-full">
            <UButton
              v-if="resultRoute" icon="i-lucide-chart-no-axes-combined" color="primary" variant="ghost" size="xs"
              :label="isSmallDesktopOrMobile ? undefined : 'Results'" :to="resultRoute?.to"
            />
            <UButton
              v-if="hasPreview" :icon="isPreviewOpen ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :color="isPreviewOpen ? 'primary' : 'neutral'" variant="soft" size="xs"
              :label="isPreviewOpen ? 'Hide Preview' : 'Preview'" @click="emit('togglePreview')"
            />
            <UButton
              icon="i-lucide-download" color="primary" variant="soft" size="xs" :label="isSmallDesktopOrMobile ? undefined : 'Download'"
              @click="handleDownload"
            />
          </div>
        </div>
      </template>

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
        <AnimatePresence>
          <Motion
            v-if="isPreviewOpen && previewContent"
            :initial="{ opacity: 0, height: 0 }"
            :animate="{ opacity: 1, height: 'auto' }"
            :exit="{ opacity: 0, height: 0 }"
            :transition="{ type: 'spring', stiffness: 300, damping: 30 }"
          >
            <div
              v-if="isPreviewOpen && previewContent"
              ref="previewEl"
              class="overflow-auto whitespace-pre text-sm"
              v-html="previewContent"
            />

            <!--  -->
          </Motion>
        </AnimatePresence>
      </template>
    </UPageCard>
  </motion.div>
</template>
