<script setup lang="ts">
import type { InputMenuItem, InputMenuProps } from '@nuxt/ui'
import type { FacetDistribution, SearchParams } from 'meilisearch'
import { useFacetSearch } from '../../../../../composables/meili/useFacetSearch'

interface Props {
  meiliIndex: string
  filterAttribute: string
  filterOperator: SetOperator
  facetDistribution?: FacetDistribution
  inputMenuProps?: InputMenuProps
  searchParams: SearchParams
}

// props
const props = defineProps<Props>()
const model = defineModel<string[] | undefined>()
const value = ref<Exclude<ComparisonValues, number> | undefined>(undefined)
const selectedValue = ref<{ label: string, count: number } | undefined>(undefined)
const inputMenuProps = toRef(() => props.inputMenuProps)
const meiliIndex = toRef(() => props.meiliIndex)
const searchParams = toRef(() => props.searchParams)
const filterAttribute = toRef(() => props.filterAttribute)
const facetDistribution = toRef(() => props.facetDistribution)
const searchTerm = ref<string>('')
const { searchForFacetValues, facetResult } = useFacetSearch({ meiliIndex })

onMounted(() => {
  searchForFacetValues({ ...searchParams.value, facetName: filterAttribute.value, facetQuery: '' })
})

watch(searchTerm, (newVal) => {
  // console.log('watch searchTerm', newVal)
  if (!newVal) {
    return
  }
  // console.log('searchTerm changed', newVal)
  // console.log('filterAttribute', filterAttribute.value)
  searchForFacetValues({ ...searchParams.value, facetName: filterAttribute.value, facetQuery: newVal })
})

const facetDistributionItems = computed<InputMenuItem[]>(() => {
  const facetDistributionVal = toValue(facetDistribution)
  const filterAttributeVal = toValue(filterAttribute)

  if (!facetDistributionVal) {
    return []
  }
  const categoriesDistribution = facetDistributionVal[filterAttributeVal] || {}
  return Object.entries(categoriesDistribution).map(([key, count]) => ({
    label: key,
    count: count as number,
  }))
})

const items = computed<InputMenuItem[]>(() => {
// if use is not searching, show all facet values available
  if (!searchTerm.value) {
    return facetDistributionItems.value
  }
  // user is searching, show search results
  const facetResultVal = toValue(facetResult)
  return facetResultVal?.facetHits.map(facet => ({
    label: facet.value,
    count: facet.count,
  })) || []
})

const sanitizedInputMenuProps = computed(() => {
  const inputMenuPropsVal = toValue(inputMenuProps)
  return {
    ...inputMenuPropsVal,
    multiple: false,
    items: items.value,
    placeholder: inputMenuPropsVal?.placeholder || 'Single selection',
  }
})

watch(selectedValue, (newVal) => {
  value.value = newVal?.label
})
</script>

<template>
  <div>
    <!-- <pre>facet results: {{ facetResult }}</pre> -->

    <UInputMenu
      v-bind="sanitizedInputMenuProps" v-model="model" v-model:search-term="searchTerm" ignore-filter
      value-key="label" class="w-full"
    >
      <template #item-label="{ item }">
        {{ item.label }}

        <span class="text-muted text-xs">
          {{ item.count }}
        </span>
      </template>
    </UInputMenu>
  </div>
</template>
