<script setup lang="ts">
import { computed, toRefs, toValue } from 'vue'

export interface Props {
  dois?: string | undefined
}

const props = withDefaults(defineProps<Props>(), { dois: undefined })
const { dois } = toRefs(props)

const doisList = computed(() => {
  const doisVal = toValue(dois)
  if (doisVal) {
    return doisVal
      .split(',')
      .map(doi => doi.trim())
      .filter(doi => doi !== '' && doi)
  }
  return []
})
</script>

<template>
  <span v-if="doisList.length > 0">

    (
    <template v-for="doi, i in doisList" :key="doi">
      <Ulink>{{ doi }}</Ulink>
      <span v-if="i !== doisList.length - 1">, </span>
    </template>
    )
  </span>
</template>
