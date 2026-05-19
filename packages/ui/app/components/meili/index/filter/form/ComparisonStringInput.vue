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
const model = defineModel<string | undefined>()
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

const placeholder = computed(() => {
  const inputMenuPropsVal = toValue(inputMenuProps)
  return inputMenuPropsVal?.placeholder || 'Single selection'
})

function isMenuItem(item: unknown): item is { label: string, count: number } {
  return !!item && typeof item === 'object' && 'label' in item && 'count' in item
}
</script>

<template>
  <div>
    <!-- <pre>facet results: {{ facetResult }}</pre> -->

    <UInputMenu
      v-model:search-term="searchTerm"
      :items="items"
      :placeholder="placeholder"
      :multiple="false"
      :model-value="model"
      ignore-filter
      value-key="label"
      class="w-full"
      @update:model-value="model = $event as string"
    >
      <template #item-label="{ item }">
        <template v-if="isMenuItem(item)">
          {{ item.label }}

          <span class="text-muted text-xs">
            {{ item.count }}
          </span>
        </template>
      </template>
    </UInputMenu>
  </div>
</template>
