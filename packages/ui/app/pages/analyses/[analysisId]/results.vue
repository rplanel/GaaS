<script lang="ts" setup>
import type { AnalysesWithOutputsAndWorkflow } from '#layers/@gaas-ui/app/types'
import type { WorkflowRow } from 'nuxt-galaxy'

interface Props {
  analysisId: number
  analysis: AnalysesWithOutputsAndWorkflow
  workflow: WorkflowRow
}

const props = withDefaults(defineProps<Props>(), {})
// const tagTypes = ['results', 'rejected', 'other'] as const
// type TagsType = typeof tagTypes[number]

const { analysis, workflow } = toRefs(props)

const outputs = computed(() => {
  const analysisVal = toValue(analysis)
  return analysisVal?.analysis_outputs ?? []
})

export type OutputsWithDatasets = typeof outputs.value
// const { resultOutputs } = useDatabaseResultDatasets<TagsType>({
//   datasets: outputs,
//   tagTypes,
// })

// const { componentName } = useWorkflowComponent({ workflow })
</script>

<template>
  <div>
    <NuxtPage :datasets="outputs" :workflow="workflow" />
  </div>
</template>

<style></style>
