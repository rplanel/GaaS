<script lang="ts" setup>
// import type { Database } from 'nuxt-galaxy'
// import type { QueryData } from '@supabase/supabase-js'
import type { AnalysesWithOutputsAndWorkflow, WorkflowFromAnalysis } from '#layers/@gaas-ui/app/types'
// import type { AnalysesWithOutputsAndWorkflow, WorkflowFromAnalysis } from '#layers/@gaas-ui'

interface Props {
  analysisId: number
  analysis: AnalysesWithOutputsAndWorkflow
  workflow: WorkflowFromAnalysis
}

const props = withDefaults(defineProps<Props>(), {})
const tagTypes = ['results', 'rejected', 'other'] as const
type TagsType = typeof tagTypes[number]

const { analysis, workflow } = toRefs(props)
const { workflowTagName, workflowTagVersion } = useDatabaseWorkflow({
  workflow,
})

const outputs = computed(() => {
  const analysisVal = toValue(analysis)
  return analysisVal?.analysis_outputs
})

const { resultOutputs } = useDatabaseResultDatasets<TagsType>({
  datasets: outputs,
  tagTypes,
})
</script>

<template>
  <NuxtPage
    :datasets="resultOutputs"
    :workflow="{ version: workflowTagVersion, name: workflowTagName }"
  />
</template>

<style>
</style>
