<script setup lang="ts">
import type { ResultsViewProps } from '#gaas/ui'

// The same props every results view receives, so a developer can start from
// this component's contract when writing their own (ADR 0003).
const props = defineProps<ResultsViewProps>()

// The user reads one line and nothing else: the inputs, jobs and outputs are
// already listed above this view. The path is for the developer writing the
// view, so only the development server shows it.
const development = isDevelopmentMode()

/** The one file that would replace this view, spelled with the workflow's own tag values. */
const viewPath = computed(() =>
  `app/workflows/${props.analysis.workflows.name_key}/${props.analysis.workflows.version_key}/results.vue`,
)
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted">
      This workflow has no dedicated results view yet.
    </p>
    <UAlert
      v-if="development"
      icon="i-lucide:code" color="neutral" variant="subtle"
      title="Shown by the development server only"
    >
      <template #description>
        Create <code>{{ viewPath }}</code> to give this workflow a results view.
      </template>
    </UAlert>
  </div>
</template>
