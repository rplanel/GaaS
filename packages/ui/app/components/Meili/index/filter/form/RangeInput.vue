<script setup lang="ts">
import type { SliderProps } from '@nuxt/ui'
import type { FacetStats } from 'meilisearch'
import { useFacetSearch } from '../../../../../composables/meili/useFacetSearch'

interface Props {
  meiliIndex: string
  filterAttribute: string
  filterOperator: SetOperator
  facetStats?: Ref<FacetStats>
  sliderProps?: SliderProps
}

// props
const props = defineProps<Props>()

// const emit = defineEmits<{
//   'update:modelValue': []
// }>()

const range = defineModel<[number, number] | undefined>('modelValue')

const meiliIndex = toRef(() => props.meiliIndex)
const filterAttribute = toRef(() => props.filterAttribute)
// const filterOperator = toRef(() => props.filterOperator)
const sliderProps = toRef(() => props.sliderProps)
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
  range.value = [statsForAttribute.min as number, statsForAttribute.max as number]
}, { immediate: true })
</script>

<template>
  <div class="w-full py-5">
    <UFormField
      :label="`Select range for '${filterAttribute}'`"
      :ui="{
        wrapper: 'py-5',
      }"
      description="Filter items within the selected range"
      help="Drag the handles to set the minimum and maximum values."
      size="xl"
    >
      <USlider v-model="range" :min :max tooltip v-bind="sliderProps" />
    </UFormField>
  </div>
</template>
