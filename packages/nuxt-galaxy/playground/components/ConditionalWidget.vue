<script setup lang="ts">
import type { GalaxyConditionalParameter, WorkflowConditionalParametersValue, WorkflowParameterValue } from 'blendtype'
import ParameterWidget from './ParameterWidget.vue'

const props = defineProps<{
  parameter: GalaxyConditionalParameter
  modelValue: WorkflowParameterValue
}>()

const emit = defineEmits<{ 'update:modelValue': [value: WorkflowConditionalParametersValue] }>()

/**
 * The bag the conditional saved, the parameters of the case it was saved on
 * as far as the bag holds them, and an edit of one of them written back as a
 * new bag: `nuxt-galaxy`'s rules (#166, #167).
 */
const saved = computed(() => parameterGroupValue(props.modelValue))
const offered = computed(() => parametersSavedIn(conditionalCaseInputs(props.parameter, props.modelValue) ?? [], saved.value))

function setChild(name: string, value: WorkflowParameterValue) {
  emit('update:modelValue', parameterGroupWithChild(props.modelValue, name, value))
}
</script>

<template>
  <div>
    <!--
      The test parameter heads the conditional, labelled as any widget is, so
      by its name when Galaxy sends `label: ''`, as Galaxy's form does from
      26.1 on. It is shown and never written: an analysis does not switch a
      case (#94), and a test parameter written alone would leave
      `__current_case__` and the case's parameters on the old case. Shown
      whatever the bag holds, as `@gaas/ui`'s heading is: it heads the
      conditional rather than being offered for an edit.
    -->
    <ParameterWidget
      :parameter="parameter.test_param"
      :model-value="saved[parameter.test_param.name]"
      disabled
    />
    <ParameterWidget
      v-for="child in offered"
      :key="child.name"
      :parameter="child"
      :model-value="saved[child.name]"
      @update:model-value="setChild(child.name, $event)"
    />
  </div>
</template>
