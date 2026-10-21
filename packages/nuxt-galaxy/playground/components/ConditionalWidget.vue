<script setup lang="ts">
import type { GalaxyConditionalParameter, WorkflowConditionalParametersValue, WorkflowParameterValue } from 'blendtype'
import { savedParameters } from '../utils/savedParameters'
import ParameterWidget from './ParameterWidget.vue'

const props = defineProps<{
  parameter: GalaxyConditionalParameter
  modelValue: WorkflowParameterValue
}>()

const emit = defineEmits<{ 'update:modelValue': [value: WorkflowConditionalParametersValue] }>()

/**
 * The bag the conditional saved, the parameters of the case it was saved on,
 * and an edit of one of them written back as a new bag: `nuxt-galaxy`'s rules
 * (#166).
 */
const saved = computed(() => parameterGroupValue(props.modelValue))
const testParameter = computed(() => savedParameters([props.parameter.test_param], saved.value))
const children = computed(() => savedParameters(conditionalCaseInputs(props.parameter, props.modelValue) ?? [], saved.value))

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
      `__current_case__` and the case's parameters on the old case.
    -->
    <ParameterWidget
      v-for="test in testParameter"
      :key="test.parameter.name"
      :parameter="test.parameter"
      :model-value="test.value"
      disabled
    />
    <ParameterWidget
      v-for="child in children"
      :key="child.parameter.name"
      :parameter="child.parameter"
      :model-value="child.value"
      @update:model-value="setChild(child.parameter.name, $event)"
    />
  </div>
</template>
