<script setup lang="ts">
import type { InputNumberProps } from '@nuxt/ui'
import type { FacetStats } from 'meilisearch'
import { useFacetSearch } from '../../../../../composables/meili/useFacetSearch'

interface Props {
  meiliIndex: string
  filterAttribute: string
  filterOperator: SetOperator
  facetStats?: Ref<FacetStats>
  inputNumberProps?: InputNumberProps
}

// props
const props = defineProps<Props>()

// const emit = defineEmits<{
//   'update:modelValue': []
// }>()

const range = defineModel<number | undefined>('modelValue')

const meiliIndex = toRef(() => props.meiliIndex)
const filterAttribute = toRef(() => props.filterAttribute)
// const filterOperator = toRef(() => props.filterOperator)
const inputNumberProps = toRef(() => props.inputNumberProps)
const facetStats = toRef(() => props.facetStats)
// const range = ref<[number, number] | undefined>(undefined)
const min = ref<number | undefined>(undefined)
const max = ref<number | undefined>(undefined)
// facet search
const { searchForFacetValues,
  // facetResult
} = useFacetSearch({ meiliIndex })

onMounted(() => {
  searchForFacetValues(filterAttribute.value, '')
})

watch([facetStats, filterAttribute], (newVal) => {
  const [newFacetStats, newFilterAttribute] = newVal
  const newFacetStatsVal = toValue(newFacetStats)
  const filterAttributeVal = toValue(newFilterAttribute)

  if (!newFacetStatsVal || !filterAttributeVal) {
    return
  }

  const statsForAttribute = newFacetStatsVal?.[filterAttributeVal]
  if (!statsForAttribute) {
    return
  }
  min.value = statsForAttribute.min as number
  max.value = statsForAttribute.max as number
  range.value = statsForAttribute.min as number
}, { immediate: true })
</script>

<template>
  <div class="w-full">
    <UInputNumber v-model="range" :min="min" :max="max" v-bind="inputNumberProps" />
  </div>
</template>
