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

/**
 * Which widget renders one parameter — and the reason its props are not
 * typechecked (#111).
 *
 * #111 asked whether this template can typecheck what it hands a widget at
 * all, since a widget declaring `modelValue: string` received a `boolean`
 * for a whole release and nothing complained. Measured, both ways:
 *
 * - annotate this return as **one** concrete component and vue-tsc does
 *   check the props — it reports the very defect #111 is about, `Type
 *   'WorkflowParameterValue | undefined' is not assignable to type 'string'`
 *   on the `v-model` below;
 * - annotate it as the **union** of the six widgets and vue-tsc reports
 *   nothing at all. Not an error about the union, nothing: the checking
 *   stops. So a union annotation would buy the look of a typed `:is` and
 *   none of the substance, which is worse than `unknown` because it reads
 *   as safe.
 *
 * And one concrete component is not available here. Which widget renders a
 * parameter is decided at run time from `param.type`, in
 * `useGalaxyToolInputComponent`; a `v-for` over `GalaxyToolParameters[]`
 * cannot narrow that discriminant per iteration into a distinct static
 * component, and `v-bind="toolInput"` spreads the whole union regardless.
 * Spelling the six out as a `v-if` chain would typecheck them, and would put
 * back in this template the mapping #87 pulled out of two screens — and this
 * component renders both of them.
 *
 * **Decision: this class of bug stays test-caught.** What holds instead is
 * that each widget declares the type it really receives, so the declaration
 * is honest even where nothing reads it, and that the widgets are driven
 * from recorded payloads in test rather than from hand-written values — a
 * hand-written value is checked against the declaration and so can only
 * carry shapes the declaration already admits, which is exactly how #111
 * went unseen.
 */
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
