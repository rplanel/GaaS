<script setup lang="ts" generic="T">
import type { InputNumberProps } from '@nuxt/ui'
import type { Column } from '@tanstack/table-core'
import type { FacetStats } from 'meilisearch'

export interface ContinuousHeaderProps<T> {
  column: Column<T>
  label?: string
  facetStats: FacetStats | undefined
  initialFacetStats?: FacetStats | undefined

}

const props = withDefaults(defineProps<ContinuousHeaderProps<T>>(), {
})

const facetStats = toRef(props, 'facetStats')
const initialFacetStats = toRef(props, 'initialFacetStats')

const column = toRef(props, 'column')

// ===================
// facetStats related
// ===================

/**
 * computed property of the facet name corresponding to the current column
 */
const facetName = computed(() => {
  const columnVal = toValue(column)
  if (!columnVal || !columnVal.id) {
    return undefined
  }
  return columnVal.id
})

const columnFacetStat = computed(() => {
  const facetStatsVal = toValue(facetStats)
  const facetNameVal = toValue(facetName)
  if (!facetStatsVal || !facetNameVal || !facetStatsVal[facetNameVal]) {
    return undefined
  }
  return facetStatsVal[facetNameVal]
})

/**
 * initial facet stats
 */

// const initialFacetStats = ref<FacetStats | undefined>(undefined)

onBeforeMount(() => {
  initialFacetStats.value = undefined
})

/**
 * Type guard to validate that a range is defined and contains valid numbers
 */
function isValidRange(range: number[] | undefined) {
  return !!range && range.length === 2
    && typeof range[0] === 'number' && typeof range[1] === 'number'
    && !Number.isNaN(range[0]) && !Number.isNaN(range[1])
}

/**
 * computed property of the initial column facet stats. It corresponds to the facet stat
 * if the current column.
 */
const initialColumnFacetStat = computed(() => {
  const initialFacetStatsVal = toValue(initialFacetStats)
  const facetNameVal = toValue(facetName)
  if (!initialFacetStatsVal || !facetNameVal || !initialFacetStatsVal[facetNameVal]) {
    return undefined
  }
  return initialFacetStatsVal[facetNameVal]
})

const initialRangeFacet = computed<number[] | undefined>(() => {
  const initialColumnFacetStatVal = toValue(initialColumnFacetStat)
  if (!initialColumnFacetStatVal) {
    return undefined
  }
  const { min, max } = initialColumnFacetStatVal
  return [min as number, max as number]
})

const initialValidatedRangeFromFacet = computed(() => {
  const initialRangeFacetVal = toValue(initialRangeFacet)
  if (isValidRange(initialRangeFacetVal)) {
    return initialRangeFacetVal
  }
  return undefined
})

const rangeFromFacet = computed<number[] | undefined>(() => {
  const columnFacetStatVal = toValue(columnFacetStat)
  if (!columnFacetStatVal) {
    return undefined
  }
  const { min, max } = columnFacetStatVal
  return [min as number, max as number]
})

const validatedRangeFromFacet = computed(() => {
  const rangeFromFacetVal = toValue(rangeFromFacet)
  if (isValidRange(rangeFromFacetVal)) {
    return rangeFromFacetVal
  }
  return undefined
})

/**
 * Range model
 */
const modelValue = defineModel<number[] | undefined>(undefined)

// Only initialize modelValue when it's truly not set (undefined or empty)
watch(rangeFromFacet, (rangeFromFacetVal) => {
  if (!modelValue.value && isValidRange(rangeFromFacetVal)) {
    modelValue.value = rangeFromFacetVal
  }
}, { immediate: true })

const rangeMin = computed({
  get: () => modelValue.value?.[0],
  set: (value: number) => {
    if (modelValue.value?.[1] !== undefined) {
      modelValue.value = [value, modelValue.value[1]]
    }
  },
})

const rangeMax = computed({
  get: () => modelValue.value?.[1],
  set: (value: number) => {
    if (modelValue.value?.[0] !== undefined) {
      modelValue.value = [modelValue.value[0], value]
    }
  },
})

// Watch column visibility and reset slider when hidden
watch(() => column.value.getIsVisible(), (isVisible, oldIsVisible) => {
  if (!isVisible) {
    modelValue.value = undefined
  }
  if (isVisible && !oldIsVisible) {
    const rangeFromFacetVal = toValue(rangeFromFacet)
    if (isValidRange(rangeFromFacetVal)) {
      modelValue.value = rangeFromFacetVal
    }
  }
})

onUnmounted(() => {
  modelValue.value = undefined
  initialFacetStats.value = undefined
})

const inputNumberProps = ref<InputNumberProps>({
  size: 'sm',
  orientation: 'vertical',
  variant: 'soft',

})

const step = computed(() => {
  const validatedRange = toValue(validatedRangeFromFacet)
  if (!validatedRange) {
    return 1
  }
  const [min, max] = validatedRange
  return typeof min === 'number' && typeof max === 'number' ? (max - min) / 100 : 1
})
</script>

<template>
  <div>
    <div v-if="validatedRangeFromFacet && initialValidatedRangeFromFacet" class="flex flex-col gap-3 w-full">
      <div class="flex flex-row gap-1 justify-between">
        <UInputNumber
          v-model="rangeMin"
          name="rangeMin"
          :min="initialValidatedRangeFromFacet[0]"
          :max="initialValidatedRangeFromFacet[1]"
          v-bind="inputNumberProps"
        />
        <UInputNumber
          v-model="rangeMax"
          name="rangeMax"
          :min="initialValidatedRangeFromFacet[0]"
          :max="initialValidatedRangeFromFacet[1]"
          v-bind="inputNumberProps"
        />
      </div>
      <div>
        <USlider
          v-if="modelValue"
          v-model="modelValue"
          :min="initialValidatedRangeFromFacet[0]"
          :max="initialValidatedRangeFromFacet[1]"
          :step="step"
        />
      </div>
    </div>
  </div>
</template>
