<script setup lang="ts">
import type { GalaxySelectToolParameter, WorkflowParameterValue } from 'blendtype'

const props = defineProps<{
  parameter: GalaxySelectToolParameter
  modelValue: WorkflowParameterValue
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>()

/** The value of the option chosen. A saved value no option holds leaves the select on nothing. */
const chosen = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

/**
 * The values of the options chosen, for a multiple select, which Galaxy
 * saves as a list of them. A string reads as a list of one, as
 * `selectOptionLabels` reads it.
 */
const chosenList = computed({
  get: () => Array.isArray(props.modelValue) ? props.modelValue : typeof props.modelValue === 'string' ? [props.modelValue] : [],
  set: (values: string[]) => emit('update:modelValue', values),
})
</script>

<template>
  <p>
    <label>
      <span>{{ parameter.label || parameter.name }}</span>
      <!-- Each option by its label, holding its value: `nuxt-galaxy`'s rule (#183). -->
      <select v-if="parameter.multiple" v-model="chosenList" multiple :disabled="disabled">
        <option v-for="option in selectOptions(parameter)" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <select v-else v-model="chosen" :disabled="disabled">
        <option v-for="option in selectOptions(parameter)" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
  </p>
</template>
