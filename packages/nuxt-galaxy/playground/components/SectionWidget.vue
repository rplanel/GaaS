<script setup lang="ts">
import type { GalaxySectionToolParameter, WorkflowConditionalParametersValue, WorkflowParameterValue } from 'blendtype'
import { savedParameters } from '../utils/savedParameters'
import ParameterWidget from './ParameterWidget.vue'

const props = defineProps<{
  parameter: GalaxySectionToolParameter
  modelValue: WorkflowParameterValue
}>()

const emit = defineEmits<{ 'update:modelValue': [value: WorkflowConditionalParametersValue] }>()

/**
 * The bag the section saved, and an edit of one child written back as a new
 * bag: `nuxt-galaxy`'s rules (#166), which say why the level above has to be
 * handed a new value.
 */
const children = computed(() => savedParameters(props.parameter.inputs, parameterGroupValue(props.modelValue)))

function setChild(name: string, value: WorkflowParameterValue) {
  emit('update:modelValue', parameterGroupWithChild(props.modelValue, name, value))
}
</script>

<template>
  <fieldset>
    <!-- Galaxy sends `title: null` for a section the tool gave none, and its form shows the name then. -->
    <legend>{{ parameter.title || parameter.name }}</legend>
    <ParameterWidget
      v-for="child in children"
      :key="child.parameter.name"
      :parameter="child.parameter"
      :model-value="child.value"
      @update:model-value="setChild(child.parameter.name, $event)"
    />
  </fieldset>
</template>
