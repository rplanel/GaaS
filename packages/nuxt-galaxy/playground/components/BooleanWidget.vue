<script setup lang="ts">
import type { GalaxyBooleanToolParameter, WorkflowParameterValue } from 'blendtype'

const props = defineProps<{
  parameter: GalaxyBooleanToolParameter
  modelValue: WorkflowParameterValue
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: 'true' | 'false'] }>()

/**
 * Whether the box is ticked, read the way Galaxy reads a saved boolean, and
 * the spelling a tick writes back: `nuxt-galaxy`'s rules (#166), which say
 * why neither is `truevalue` or `falsevalue`.
 */
const checked = computed({
  get: () => isBooleanParameterTrue(props.parameter, props.modelValue),
  set: (value: boolean) => emit('update:modelValue', booleanParameterSpelling(value)),
})
</script>

<template>
  <p>
    <label>
      <span>{{ parameter.label || parameter.name }}</span>
      <input v-model="checked" type="checkbox" :disabled="disabled">
    </label>
  </p>
</template>
