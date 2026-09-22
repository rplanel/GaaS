<script lang="ts" setup>
import type { ResultsViewProps } from '#gaas/ui'

// The name-level results view (ADR 0003): it applies to every version of the
// `satelliteFinder` workflow that has no `satelliteFinder/<version>/results.vue`
// of its own, and to no other workflow name.
const props = defineProps<ResultsViewProps>()

const workflow = computed(() => props.analysis.workflows)
</script>

<template>
  <div>
    <h1 class="text-xl font-bold">
      {{ workflow.name }} <VersionBadge :version="workflow.version_key" />
    </h1>
    <p class="text-sm text-muted">
      Name-level results view for <code>{{ workflow.name_key }}</code>, applied to version
      <code>{{ workflow.version_key }}</code>: {{ analysis.analysis_outputs.length }}
      output{{ analysis.analysis_outputs.length === 1 ? '' : 's' }}.
    </p>
  </div>
</template>
