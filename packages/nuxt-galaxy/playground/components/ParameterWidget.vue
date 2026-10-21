<script setup lang="ts">
import type { GalaxyToolParameters, WorkflowParameterValue } from 'blendtype'
import BooleanWidget from './BooleanWidget.vue'
import ConditionalWidget from './ConditionalWidget.vue'
import NumberWidget from './NumberWidget.vue'
import RepeatWidget from './RepeatWidget.vue'
import SectionWidget from './SectionWidget.vue'
import SelectWidget from './SelectWidget.vue'
import TextWidget from './TextWidget.vue'

/**
 * The widget for one parameter, chosen by its type: the second UI's own map
 * from a parameter type to what renders it (#167). ADR 0009 keeps
 * `@gaas/ui`'s map in `@gaas/ui`, so a UI built on `nuxt-galaxy` alone
 * writes its own.
 *
 * A `data` parameter has no widget, here or in `@gaas/ui`'s form: it is fed
 * by an edge, and `offeredToolInputs` drops it at every depth before any
 * widget is chosen.
 *
 * Each widget is labelled `label || name`. Galaxy sends `label: ''` for a
 * parameter the tool declares without one, and its form shows the name then
 * (`FormInputs.vue`, on both releases).
 */
defineProps<{
  parameter: GalaxyToolParameters
  /** What the revision saved for the parameter, or the reader's edit of it. */
  modelValue: WorkflowParameterValue
  /**
   * Shown and never written, as a conditional's test parameter is. Only a
   * select or a boolean can be one, so only their widgets take it.
   */
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: WorkflowParameterValue] }>()
</script>

<template>
  <BooleanWidget
    v-if="parameter.type === 'boolean'"
    :parameter="parameter"
    :model-value="modelValue"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <SelectWidget
    v-else-if="parameter.type === 'select'"
    :parameter="parameter"
    :model-value="modelValue"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <NumberWidget
    v-else-if="parameter.type === 'integer' || parameter.type === 'float'"
    :parameter="parameter"
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <TextWidget
    v-else-if="parameter.type === 'text'"
    :parameter="parameter"
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <SectionWidget
    v-else-if="parameter.type === 'section'"
    :parameter="parameter"
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <RepeatWidget
    v-else-if="parameter.type === 'repeat'"
    :parameter="parameter"
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <ConditionalWidget
    v-else-if="parameter.type === 'conditional'"
    :parameter="parameter"
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
