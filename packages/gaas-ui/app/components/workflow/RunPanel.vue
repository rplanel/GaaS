<script setup lang="ts">
withDefaults(defineProps<{
  workflowId: number
  analysisId?: number | undefined
}>(), {
  analysisId: undefined,
})

const emits = defineEmits(['close'])
</script>

<template>
  <UDashboardPanel id="workflow-run-panel" class="overflow-auto">
    <UDashboardNavbar title="Invoke" :toggle="false">
      <template #leading>
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" class="-ms-1.5" @click="emits('close')" />
      </template>

      <template #right>
        ???
      </template>
    </UDashboardNavbar>
    <div class="flex flex-col sm:flex-row justify-between gap-1 p-4 sm:px-6 border-b border-(--ui-border)">
      <div class="flex items-start gap-4 sm:my-1.5">
        <GalaxyWorkflowInvokeForm
          v-if="workflowId"
          :workflow-id="workflowId"
          :analysis-id="analysisId"
        />
      </div>
    </div>
  </UDashboardPanel>
</template>
