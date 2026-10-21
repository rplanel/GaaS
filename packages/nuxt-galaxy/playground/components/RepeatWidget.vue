<script setup lang="ts">
import type { GalaxyRepeatToolParameter, WorkflowParameterValue } from 'blendtype'
import ParameterWidget from './ParameterWidget.vue'

const props = defineProps<{
  parameter: GalaxyRepeatToolParameter
  modelValue: WorkflowParameterValue
}>()

const emit = defineEmits<{ 'update:modelValue': [value: WorkflowParameterValue[]] }>()

/**
 * One block per instance the revision saved, the parameters in each that are
 * offered a widget, and an edit of one of them written back into the list:
 * `nuxt-galaxy`'s rules (#166, #167).
 *
 * Nothing adds or removes an instance. Only the workflow's author can
 * (`CONTEXT.md`, *Repeat*).
 */
const instances = computed(() => repeatInstances(props.modelValue))

function setChild(position: number, name: string, value: WorkflowParameterValue) {
  emit('update:modelValue', repeatWithChild(props.modelValue, position, name, value))
}

/**
 * What heads the repeat. Galaxy's form shows the title alone, on both
 * releases, and sends `title: null` when the tool gave none, so it falls back
 * to the name here as it does for a section.
 */
const heading = computed(() => props.parameter.title || props.parameter.name)
</script>

<template>
  <fieldset>
    <legend>{{ heading }}</legend>
    <!-- Keyed by `__index__`, which identifies an instance, where the position is only where it sits. -->
    <fieldset v-for="{ position, instance } in instances" :key="instance.__index__">
      <!-- Numbered from the position, one-based, as Galaxy's form numbers an instance. -->
      <legend>{{ position + 1 }}: {{ heading }}</legend>
      <ParameterWidget
        v-for="child in parametersSavedIn(parameter.inputs, instance)"
        :key="child.name"
        :parameter="child"
        :model-value="instance[child.name]"
        @update:model-value="setChild(position, child.name, $event)"
      />
    </fieldset>
  </fieldset>
</template>
