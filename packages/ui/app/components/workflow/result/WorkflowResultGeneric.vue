<script setup lang="ts">
import type { ResultsViewProps } from '#gaas/ui'

// The same props every results view receives, so a developer can start from
// this component's contract when writing their own (ADR 0003).
const props = defineProps<ResultsViewProps>()

/** The one file that would replace this view, spelled with the workflow's own tag values. */
const viewPath = computed(() =>
  `app/workflows/${props.analysis.workflows.name_key}/${props.analysis.workflows.version_key}/results.vue`,
)
</script>

<template>
  <div class="space-y-4">
    <UAlert
      icon="i-lucide:puzzle" color="info" variant="outline"
      title="No results view for this workflow"
      :description="`Create \`${viewPath}\`, named after the workflow's name and version tags, to customize this page.`"
    />
  </div>
</template>
