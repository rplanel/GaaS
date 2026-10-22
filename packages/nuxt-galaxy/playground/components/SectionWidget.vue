<script setup lang="ts">
import type { GalaxySectionToolParameter, WorkflowConditionalParametersValue, WorkflowParameterValue } from 'blendtype'
import ParameterWidget from './ParameterWidget.vue'

const props = defineProps<{
  parameter: GalaxySectionToolParameter
  modelValue: WorkflowParameterValue
}>()

const emit = defineEmits<{ 'update:modelValue': [value: WorkflowConditionalParametersValue] }>()

/**
 * The bag the section saved, the parameters in it that are offered a widget,
 * and an edit of one of them written back as a new bag: `nuxt-galaxy`'s rules
 * (#166, #167), which say why the level above has to be handed a new value.
 */
const saved = computed(() => parameterGroupValue(props.modelValue))
const offered = computed(() => parametersSavedIn(props.parameter.inputs, saved.value))

function setChild(name: string, value: WorkflowParameterValue) {
  emit('update:modelValue', parameterGroupWithChild(props.modelValue, name, value))
}
</script>

<template>
  <fieldset>
    <!-- Galaxy sends `title: null` for a section the tool gave none, and its form shows the name then. -->
    <legend>{{ parameter.title || parameter.name }}</legend>
    <ParameterWidget
      v-for="child in offered"
      :key="child.name"
      :parameter="child"
      :model-value="saved[child.name]"
      @update:model-value="setChild(child.name, $event)"
    />
  </fieldset>
</template>
