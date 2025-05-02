<script setup lang="ts">
import type { GalaxyDataToolParameter } from 'blendtype'

const props = withDefaults(
  defineProps<GalaxyDataToolParameter & { modelValue: any }>(),
  {},
)

const emit = defineEmits(['update:modelValue'])
const model = computed({
  get() {
    return props.modelValue
  },
  set(val) {
    emit('update:modelValue', val)
  },
})
</script>

<template>
  <div>
    Data tool parameters needs to be implemented
    <pre>{{ model }}</pre>
  </div>
</template>
