<script setup lang="ts">
interface Props {
  analysisId: number
  workflowSlug: string
  slug?: string
  targetComponentName?: string
}

const props = defineProps<Props>()

const targetComponentName = toRef(() => props.targetComponentName)
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="targetComponentName" icon="i-lucide:puzzle" color="info" variant="outline"
      :title="targetComponentName"
      :description="`Create \`app/components/${targetComponentName}.vue\` to customize the result page for workflow '${workflowSlug}'.`"
    />
  </div>
</template>
