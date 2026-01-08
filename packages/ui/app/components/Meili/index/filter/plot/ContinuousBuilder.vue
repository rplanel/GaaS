<script setup lang="ts" generic="T">
import type { InputNumberProps } from '@nuxt/ui'
import type { Column } from '@tanstack/table-core'
import type { FacetStats } from 'meilisearch'

export interface ContinuousHeaderProps<T> {
  column: Column<T>
  label?: string
  totalHits: number
  facetStats: FacetStats | undefined
  initialFacetStats?: FacetStats | undefined

}

const props = withDefaults(defineProps<ContinuousHeaderProps<T>>(), {
})

// Models
const modelValue = defineModel<number[]>()
// const modelFilter = defineModel<FacetFilter | undefined>('filter')

// const facetStats = toRef(props, 'facetStats')
const initialFacetStats = toRef(props, 'initialFacetStats')
const column = toRef(props, 'column')

const initialMin = ref<number>(0)
const initialMax = ref<number>(0)

// const columnFacetStat = computed(() => {
//   const facetStatsVal = toValue(facetStats)
//   const columnId = column.value.id
//   if (!facetStatsVal || !facetStatsVal[columnId]) {
//     return undefined
//   }
//   return facetStatsVal[columnId]
// })

const initialColumnFacetStat = computed(() => {
  const facetStatsVal = toValue(initialFacetStats)
  const columnId = column.value.id
  if (!facetStatsVal || !facetStatsVal[columnId]) {
    return undefined
  }
  return facetStatsVal[columnId]
})

// const minMaxValues = computed(() => {
//   const columnFacetStatVal = toValue(columnFacetStat)

//   if (!columnFacetStatVal) {
//     return { min: 0, max: 0 }
//   }
//   const { min, max } = columnFacetStatVal
//   return { min: min as number, max: max as number }
// })

const initialMinMaxValues = computed(() => {
  const columnFacetStatVal = toValue(initialColumnFacetStat)

  if (!columnFacetStatVal) {
    return { min: 0, max: 0 }
  }
  const { min, max } = columnFacetStatVal
  return { min: min as number, max: max as number }
})

const rangeMin = computed({
  get: () => modelValue.value?.[0],
  set: (value: number) => {
    if (modelValue.value?.[1]) {
      modelValue.value = [value, modelValue.value[1]]
    }
    modelValue.value = []
  },
})

const rangeMax = computed({
  get: () => modelValue.value?.[1],
  set: (value: number) => {
    if (modelValue.value?.[0]) {
      modelValue.value = [modelValue.value[0], value]
    }
  },
})

onMounted(() => {
  const { min, max } = initialMinMaxValues.value
  initialMin.value = min
  initialMax.value = max
  modelValue.value = [min, max]
})

watch(initialMinMaxValues, (newVal) => {
  const { min, max } = newVal
  initialMin.value = min
  initialMax.value = max
  modelValue.value = [min, max]
  // rangeMin.value = min
  // rangeMax.value = max
})

// Watch column visibility and reset slider when hidden
watch(() => column.value.getIsVisible(), (isVisible) => {
  if (!isVisible) {
    modelValue.value = []
  }
})

// onBeforeUnmount(() => {
//   console.log('ContinuousHeader before unmount')
//   modelValue.value = []
// })
onUnmounted(() => {
  modelValue.value = []
})

const inputNumberProps = ref<InputNumberProps>({
  size: 'sm',
  orientation: 'vertical',
  variant: 'soft',

})

// const facetFilter = computed<FacetFilter | undefined>(() => {
//   const columnVal = toValue(column)
//   const range = toValue(modelValue)
//   if (range) {
//     return {
//       attribute: columnVal.id as Facet,
//       type: 'range',
//       operator: 'TO',
//       values: range,
//     }
//   }
//   return undefined
// })

// watch(facetFilter, (newFilter) => {
//   modelFilter.value = newFilter
// })
</script>

<template>
  <div>
    <div class="flex flex-col gap-3 w-full">
      <div class="flex flex-row gap-1 justify-between">
        <UInputNumber v-model="rangeMin" :min="initialMin" :max="initialMax" v-bind="inputNumberProps" />

        <UInputNumber v-model="rangeMax" :min="initialMin" :max="initialMax" v-bind="inputNumberProps" />
      </div>
      <div>
        <USlider
          v-model="modelValue" :min="initialMin" :max="initialMax"
          :step="((initialMax || 0) - (initialMin || 0)) / 100"
        />
      </div>
    </div>
  </div>
</template>
