<script setup lang="ts">
export interface Props {
  label?: string
  optional?: boolean
  tag?: string[]
  multiple: boolean
}

withDefaults(defineProps<Props>(), {
  label: 'File input',
  optional: false,
})

// get list of datasets
</script>

<template>
  <div>
    <v-select />
  </div>
</template>
