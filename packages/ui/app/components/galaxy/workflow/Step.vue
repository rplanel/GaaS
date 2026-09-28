<script setup lang="ts">
import type { GalaxyToolParameters, WorkflowToolParameters } from 'blendtype'
import type { DescribedStep } from 'nuxt-galaxy'
import type { GalaxyToolInputComponent } from '../../../composables/galaxy/useGalaxyToolInputComponent'

export interface Props {
  variant?: 'form' | 'display'
  workflowStep: MaybeRef<DescribedStep | undefined>
  toolParameters: GalaxyToolParameters[] | undefined
  parametersInputsComponent:
    | Record<string, GalaxyToolInputComponent>
    | undefined
  /**
   * The values the revision was saved with, which is `DescribedStep.tool_inputs`
   * handed straight on. Named rather than spelled out: this used to carry its
   * own copy of `WorkflowParameterValue`, and the copy went stale the moment
   * #102 found that a saved value can also be a number, a boolean, `null` or
   * a repeat's instances.
   */
  workflowParametersModel: WorkflowToolParameters | undefined
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
