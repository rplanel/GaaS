<script setup lang="ts">
import type { GalaxyFloatToolParameter, GalaxyIntegerToolParameter, WorkflowParameterValue } from 'blendtype'

defineProps<{
  parameter: GalaxyIntegerToolParameter | GalaxyFloatToolParameter
  modelValue: WorkflowParameterValue
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

/**
 * The number as typed, a string, which is how the revision saves one and
 * what Galaxy's own form sends: its `FormNumber.vue` binds a `b-form-input`
 * without the `number` prop on both releases. Galaxy reads it with
 * `int(value)` or `float(value)` (`basic.py:515` and `:588` at 26.1, `:427`
 * and `:501` at 22.05). `@gaas/ui`'s number widgets write a number instead,
 * which Galaxy reads the same.
 */
function typed(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <p>
    <label>
      <span>{{ parameter.label || parameter.name }}</span>
      <!-- `any` for a float, so that no decimal the tool's range allows is refused by the browser. -->
      <input
        type="number"
        :value="modelValue"
        :min="parameter.min"
        :max="parameter.max"
        :step="parameter.type === 'integer' ? 1 : 'any'"
        @input="typed"
      >
    </label>
  </p>
</template>
