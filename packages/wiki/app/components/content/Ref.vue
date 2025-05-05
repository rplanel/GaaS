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
      .map(doi => ({
        doi,
        href: `https://doi.org/${doi}`,
      }))
  }
  return []
})
</script>

<template>
  (
  <template v-if="doisList.length > 0">
    <template v-for="doiObj, i in doisList" :key="doiObj.doi">
      <ULink :href="doiObj.href">
        {{ doiObj.doi }}
      </ULink>
      <span v-if="i !== doisList.length - 1">, </span>
    </template>
  </template>
  <template v-else>
    No ref
  </template>
  )
</template>
