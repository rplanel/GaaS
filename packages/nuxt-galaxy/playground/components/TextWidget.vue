<script setup lang="ts">
import type { GalaxyTextToolParameter, WorkflowParameterValue } from 'blendtype'

const props = defineProps<{
  parameter: GalaxyTextToolParameter
  modelValue: WorkflowParameterValue
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

/**
 * The text, which is only ever a string. Galaxy's own form shows no text for
 * anything else: a `null` an optional parameter was saved with, and a
 * runtime marker (`Ui.Input` at 22.05, `FormText`'s `valueToString` at
 * 26.1). The saved value stays in the model until the reader types.
 */
const text = computed({
  get: () => typeof props.modelValue === 'string' ? props.modelValue : '',
  set: (value: string) => emit('update:modelValue', value),
})
</script>

<template>
  <p>
    <label>
      <span>{{ parameter.label || parameter.name }}</span>
      <textarea v-if="parameter.area" v-model="text" />
      <input v-else v-model="text" type="text">
    </label>
  </p>
</template>
