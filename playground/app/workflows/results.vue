<script lang="ts" setup>
import type { ResultsViewProps } from '#gaas/ui'

// The app-wide results view (ADR 0003): it applies to every workflow of the
// application that has neither an exact nor a name-level view.
const props = defineProps<ResultsViewProps>()

const workflow = computed(() => props.analysis.workflows)
</script>

<template>
  <div>
    <h1 class="text-xl font-bold">
      {{ workflow.name }} <VersionBadge :version="workflow.version_key" />
    </h1>
    <p class="text-sm text-muted">
      App-wide results view, applied to <code>{{ workflow.name_key }}/{{ workflow.version_key }}</code>:
      {{ analysis.analysis_outputs.length }} output{{ analysis.analysis_outputs.length === 1 ? '' : 's' }}.
    </p>
  </div>
</template>
