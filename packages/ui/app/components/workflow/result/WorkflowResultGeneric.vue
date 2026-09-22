<script setup lang="ts">
interface Props {
  analysisId: number
}

defineProps<Props>()
</script>

<template>
  <div class="space-y-4">
    <UAlert
      icon="i-lucide:puzzle" color="info" variant="outline"
      title="No results view for this workflow"
      description="Create `app/workflows/<name>/<version>/results.vue`, named after the workflow's name and version tags, to customize this page."
    />
  </div>
</template>
