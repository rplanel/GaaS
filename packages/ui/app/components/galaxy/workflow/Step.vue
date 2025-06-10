<script setup lang="ts">
import type { GalaxyToolParameters, WorkflowStep } from 'blendtype'
import type { GalaxyToolInputComponent } from '../../../composables/galaxy/useGalaxyToolInputComponent'

export interface Props {
  variant?: 'form' | 'display'
  workflowStep: MaybeRef<WorkflowStep | undefined>
  toolParameters: GalaxyToolParameters[] | undefined
  parametersInputsComponent:
    | Record<string, GalaxyToolInputComponent>
    | undefined
  workflowParametersModel:
    | Record<string, string | string[] | Record<string, any>>
    | undefined
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'form',
})

const workflowStep = toRef(() => props.workflowStep)
const toolParameters = toRef(() => props.toolParameters)
const workflowParametersModel = toRef(() => props.workflowParametersModel)
const parametersInputsComponent = toRef(() => props.parametersInputsComponent)

function getComponent(toolInput: GalaxyToolParameters) {
  return toValue(parametersInputsComponent)?.[toolInput.name]?.component
}
</script>

<template>
  <div
    v-if="workflowStep && toolParameters"
    class="grid grid-flow-row"
  >
    <template
      v-for="toolInput in toolParameters"
      :key="toolInput.name"
    >
      <div
        v-if=" workflowParametersModel
          && toolInput.name in workflowParametersModel
        "
        class="border-b border-[var(--ui-border)] last:border-none px-4 py-5 w-full grow-1"
      >
        <component
          :is="getComponent(toolInput)"
          v-model="workflowParametersModel[toolInput.name]"
          :variant
          v-bind="toolInput"
        />
      </div>
    </template>
  </div>
</template>
