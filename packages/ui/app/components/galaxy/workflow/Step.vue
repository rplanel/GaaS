<script setup lang="ts">
import type { GalaxyToolParameters, WorkflowToolParameters } from 'blendtype'
import type { DescribedStep } from 'nuxt-galaxy'
import type { GalaxyToolInputComponent } from '../../../composables/galaxy/useGalaxyToolInputComponent'
import { parametersSavedIn } from '#imports'

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
 * that a widget is driven from recorded payloads in test rather than from
 * hand-written values — a hand-written value is checked against the
 * declaration and so can only carry shapes the declaration already admits,
 * which is exactly how #111 went unseen — and that its `modelValue` declares
 * the type it really receives, so the declaration is honest even where
 * nothing reads it.
 *
 * `BooleanToolParameter` has been through that second half (#111),
 * `TextToolParameter` was written through it (#113), and `GalaxyConditional`
 * went through it in #182. The other four are
 * untouched and none of their declarations has been measured against a
 * recording: `modelValue` is `string` on `FloatToolParameter`,
 * `number` on `IntegerToolParameter`, `any` on `DataToolParameter`, and
 * `string` / `string[]` on `SelectToolParameter` — the last of which #111
 * did check, and a select's saved value really is a string or a list of
 * them on both releases.
 *
 * At least one of the rest is already contradicted by the payloads: the
 * recordings save every integer parameter as a **string**, `calin_threshold`
 * as `"2"` and `dist_thresh` as `"4000"` on step 1 of
 * `conditional-repeat-runtime`, against `IntegerToolParameter`'s `number`.
 * Unaudited here because #111 scoped itself to the boolean.
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
    <!--
      Only the parameters the step's saved values name, one a reader has
      emptied included: `nuxt-galaxy`'s rule (#167), which says why.
    -->
    <template v-if="workflowParametersModel">
      <div
        v-for="toolInput in parametersSavedIn(toolParameters, workflowParametersModel)"
        :key="toolInput.name"
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
