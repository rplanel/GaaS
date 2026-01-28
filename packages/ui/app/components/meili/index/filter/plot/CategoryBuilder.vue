<script setup lang="ts" generic="T">
// import type { Column } from '@tanstack/table-core'
import type { Facet, FacetDistribution, SearchForFacetValuesParams, SearchParams } from 'meilisearch'
import { ObservablePlotRender } from '#components'
import { useFacetFilters } from '#layers/@gaas-ui/app/composables/meili/useFacetFilters'
import { useFacetSearch } from '#layers/@gaas-ui/app/composables/meili/useFacetSearch'
import { useMeiliFilter } from '#layers/@gaas-ui/app/composables/meili/useMeiliFilter'
import { usePlotLayout } from '#layers/@gaas-ui/app/composables/plot/usePlotLayout'
import * as Plot from '@observablehq/plot'
import { useElementSize } from '@vueuse/core'
import { useFrequencyPartition } from '../../../../../composables/useFrequencyPartition'

export interface CategoryHeaderProps {
  width?: number
  height?: number
  meiliIndex: string
  searchParams?: SearchParams
  // column: Column<T>
  facetAttribute: string | undefined
  label?: string
  totalHits: number
  numberOfDocuments: number
  maxValuesPerFacet?: number | undefined
  facetDistribution?: FacetDistribution | undefined
  aggregateFrequencyThreshold?: number
  addFilter?: (filter: FacetFilter) => FacetFilter & { uuid: string }
}

interface FacetCategory {
  name: string
  count: number
  frequency: number
  items?: string[]
}

const props = withDefaults(defineProps<CategoryHeaderProps>(), {
  aggregateFrequencyThreshold: 0.015,
  width: 300,
  height: 50,
})

const currentFilterId = ref<string | undefined>(undefined)
const { aggregateFrequencyThreshold, addFilter } = props
const meiliIndex = toRef(props, 'meiliIndex')
const searchParams = toRef(props, 'searchParams')
const width = toRef(props, 'width')
const height = toRef(props, 'height')
const facetDistribution = toRef(() => props.facetDistribution)
// const maxValuesPerFacet = toRef(props, 'maxValuesPerFacet')
// const totalHits = toRef(props, 'totalHits')
const numberOfDocuments = toRef(props, 'numberOfDocuments')
const { label, facetAttribute } = toRefs(props)
const modelFilter = defineModel<FacetFilter | undefined>('filter')

const { addFilter: addFacetFilter, removeFilter: removeFacetFilter, filters: filtersForFacetSearch, resetFilters: resetFacetFilters } = useFacetFilters()

const { searchForFacetValues, facetResult } = useFacetSearch({ meiliIndex })

watch([facetResult, facetDistribution], ([newFacetResult]) => {
  if (!newFacetResult) {
    searchForFacetValues({
      ...toValue(searchParams),
      facetName: facetAttribute.value as string,
      filter: [...(toValue(searchParams)?.filter ?? [])],
    })
  }
})

const { meiliFilters } = useMeiliFilter(filtersForFacetSearch)

/**
 * compute facet search params
 */

const computedFacetSearchParams = computed<SearchForFacetValuesParams | undefined>(() => {
  const searchParamsVal = toValue(searchParams)
  const facetAttributeVal = toValue(facetAttribute)
  const meiliFiltersVal = toValue(meiliFilters)

  return {
    ...searchParamsVal,
    filter: [...(searchParamsVal?.filter ?? []), ...meiliFiltersVal],
    facetName: facetAttributeVal,
  }
})

watch(computedFacetSearchParams, (newVal) => {
  const facetAttributeVal = toValue(facetAttribute)
  if (facetAttributeVal && newVal) {
    searchForFacetValues(newVal)
  }
}, { immediate: true })

const sanitizedFacetDistribution = computed<FacetCategory[]>(() => {
  // await nextTick()
  const facetResultVal = toValue(facetResult)
  const numberOfDocumentsVal = toValue(numberOfDocuments)

  if (!facetResultVal) {
    return []
  }

  return facetResultVal.facetHits.map((facet, index) => ({
    index,
    name: facet.value,
    count: facet.count,
    frequency: numberOfDocumentsVal > 0 ? facet.count / numberOfDocumentsVal : 0,
  }))
})

// const itemsCountInFacet = computed(() => sanitizedFacetDistribution.value.reduce((sum, item) => sum + item.count, 0))

function aggregateLowFrequencyItems(items: FacetCategory[]): FacetCategory {
  // const countHitsInFacet = toValue(itemsCountInFacet)
  const numberOfDocumentsVal = toValue(numberOfDocuments)
  const otherGroup = items.reduce((group, curr) => {
    group.count += curr.count

    group.items?.push(curr.name)
    // group.frequency = total > 0 ? group.count / total : 0
    return group
  }, { name: 'Aggregate', count: 0, frequency: 0, items: [] as string[] })
  const otherCount = otherGroup.count
  return {
    ...otherGroup,
    count: otherCount,
    frequency: numberOfDocumentsVal > 0 ? otherCount / numberOfDocumentsVal : 0,
  }
}

const { displayedItems, displayedItemCount, aggregatedItems } = useFrequencyPartition<FacetCategory>({
  items: sanitizedFacetDistribution,
  getId: item => item.name,
  getFrequency: item => item.frequency,
  frequencyThreshold: aggregateFrequencyThreshold,
  aggregateFn: aggregateLowFrequencyItems,
  sizeThreshold: 15,
})

function renameXPx({ x, ...options }) {
  return { ...options, px: x }
}

const normalizedHighFrequencyItems = computed<FacetCategory[]>(() => {
  return displayedItems.value.map(item => ({
    ...item,
    frequency: displayedItemCount.value > 0 ? item.count / displayedItemCount.value : 0,
  }))
})
const navPreviousEl = useTemplateRef('navPrevious')
const navNextEl = useTemplateRef('navNext')
const plotContainer = useTemplateRef('plotContainer')
const { width: navPreviousWidth } = useElementSize(navPreviousEl)
const { width: navNextWidth } = useElementSize(navNextEl)
const { width: plotContainerWidth } = useElementSize(plotContainer)
const navWidth = computed(() => {
  return (toValue(navPreviousWidth) || 0) + (toValue(navNextWidth) || 0)
})

const computedWidth = computed(() => {
  const widthVal = toValue(width)
  const plotContainerWidthVal = toValue(plotContainerWidth)
  console.warn('plotContainerWidthVal', plotContainerWidthVal, ' - widthVal', widthVal)
  const navWidthAndGap = navWidth.value + 8 // 8px gap
  return widthVal > navWidthAndGap ? widthVal - navWidthAndGap : widthVal
})

const { plotWidth, marginTop } = usePlotLayout({
  width: computedWidth,
  height,
  marginTop: ref(15),

})

function truncateString(str: string, num: number): string {
  // If the length of str is less than or equal to num
  // just return str--don't truncate it.
  if (str.length <= num) {
    return str
  }
  // Return str truncated with '...' concatenated to the end of str.
  return `${str.slice(0, num)}...`
}

const plotOptions = computed(() => {
  // if true, should display an additional bar for "Other" category
  return {
    marginTop: toValue(marginTop),
    marginRight: 0,
    marginLeft: 0,
    width: plotWidth.value,
    height: height.value,
    marginBottom: 0,
    x: {
      label: null,
      tickSize: 0,
      ticks: [],
    },
    y: {
      label: null,
      tickSize: 0,
      ticks: [],
    },
    marks: [
      Plot.barX(
        normalizedHighFrequencyItems.value,
        Plot.stackX({
          x: 'frequency',
          fill: d => d.index % 2 === 0 ? 'var(--ui-color-primary-400)' : 'var(--ui-color-primary-300)',
          inset: 0.4,
        }),
      ),
      Plot.barX(
        normalizedHighFrequencyItems.value,
        Plot.pointerX(
          renameXPx(
            Plot.stackX({
              x: 'frequency',
              fill: 'var(--ui-color-primary-100)',
              inset: 0.4,
            }),
          ),
        ),
      ),

      Plot.text(
        normalizedHighFrequencyItems.value,
        Plot.pointerX(
          renameXPx(
            Plot.stackX({
              x: 'frequency',
              dx: 0,
              dy: -5,
              frameAnchor: 'top-right',
              lineAnchor: 'bottom',
              fontVariant: 'tabular-nums',
              textOverflow: 'ellipsis',
              text: (d: FacetCategory) => `${truncateString(d.name, 50)}: ${d.count}`,
            }),
          ),
        ),
      ),

    ],
  }
})

const displayedFacetEndpoints = computed(() => {
  const items = toValue(normalizedHighFrequencyItems)
  if (items.length === 0) {
    return []
  }
  const firstItem = items[0]
  const lastItem = items[items.length - 1]
  return [firstItem, lastItem]
})
const itemToFilterOnNext = computed(() => {
  const itemEndpoints = toValue(displayedFacetEndpoints)
  if (!itemEndpoints || itemEndpoints.length < 2) {
    return undefined
  }
  return itemEndpoints[0]
})

const itemToFilterOnPrev = computed(() => {
  // get the uid of the filter to remove
  const filtersForFacetSearchVal = toValue(filtersForFacetSearch)
  if (!filtersForFacetSearchVal || filtersForFacetSearchVal.length === 0) {
    return undefined
  }

  return filtersForFacetSearchVal[filtersForFacetSearchVal.length - 1]?.uuid
})

function nextFacet() {
  const itemToFilterOnNextVal = toValue(itemToFilterOnNext)
  const facetAttributeVal = toValue(facetAttribute)
  // const searchParamsVal = toValue(computedFacetSearchParams)
  addFacetFilter({
    attribute: facetAttributeVal as Facet,
    type: 'comparison',
    operator: '!=',
    values: itemToFilterOnNextVal ? itemToFilterOnNextVal.name : undefined,
  })
  // if (itemToFilterOnNextVal && columnFacetVal && searchParamsVal) {
  //   searchForFacetValues(
  //     searchParamsVal,
  //   )
  // }
}

const hasNextFacet = computed(() => {
  const aggregatedItemsVal = toValue(aggregatedItems)
  const itemToFilterOnNextVal = toValue(itemToFilterOnNext)
  return aggregatedItemsVal.length > 0 && itemToFilterOnNextVal !== undefined
})

function prevFacet() {
  const itemToFilterOnPrevVal = toValue(itemToFilterOnPrev)

  if (itemToFilterOnPrevVal) {
    removeFacetFilter(itemToFilterOnPrevVal)
  }
}

const hasPrevFacet = computed(() => {
  const itemToFilterOnPrevVal = toValue(itemToFilterOnPrev)
  return itemToFilterOnPrevVal !== undefined
})

function createFilter(value: string | Array<string>) {
  const filter = toValue(modelFilter)
  const facetAttributeVal = toValue(facetAttribute)
  if (filter) {
    modelFilter.value = undefined
  }
  else {
    if (!facetAttributeVal) {
      console.warn('Column is undefined, cannot create filter')
    }
    if (addFilter) {
      resetFacetFilters()
      if (Array.isArray(value)) {
        const { uuid } = addFilter({
          attribute: facetAttributeVal as Facet,
          type: 'set',
          operator: 'NOT IN',
          values: value,
        })
        return uuid
      }
      else {
        const { uuid } = addFilter({
          attribute: facetAttributeVal as Facet,
          type: 'comparison',
          operator: '=',
          values: value,
        })
        return uuid
      }
    }
  }
}

function handleBarClick(plot) {
  const plotValue = plot.value
  // console.log('bar clicked', plotValue)
  if (plotValue) {
    const value = plotValue.name
    currentFilterId.value = createFilter(value)
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="label">
      {{ label }}
    </div>

    <!-- facet Browser -->
    <div ref="plotContainer" class="flex flex-row gap-2 items-start">
      <!-- Nav previous -->
      <div ref="navPrevious" class="flex flex-row items-center justify-start mt-4">
        <template v-if="hasPrevFacet">
          <div>
            <UButton
              icon="lucide:chevron-left"
              variant="link"
              size="xl"
              class="p-0"
              :disabled="!hasPrevFacet"
              @click="prevFacet"
            />
          </div>
        </template>
      </div>
      <!-- content -->
      <div class="flex items-center">
        <ObservablePlotRender :options="plotOptions" defer :click-listener="handleBarClick" />
      </div>
      <!-- Nav next -->
      <div ref="navNext" class="flex flex-row items-center justify-end mt-4">
        <template v-if="hasNextFacet">
          <div>
            <UButton
              :disabled="!hasNextFacet"
              icon="lucide:chevron-right"
              size="xl"
              variant="link"
              class="p-0"
              @click="nextFacet"
            />
          </div>
        </template>
      </div>
    </div>
    <!--  -->
    <div class="flex flex-row justify-between text-dimmed text-xs font-medium">
      <div class="truncate max-w-32">
        {{ displayedFacetEndpoints[0]?.name }} ({{ displayedFacetEndpoints[0]?.count }})
      </div>
      <div class="text-dimmed">
        <UIcon name="i-mdi:dots-horizontal" class="text-dimmed" />
      </div>
      <div class="truncate max-w-32">
        {{ displayedFacetEndpoints[displayedFacetEndpoints.length - 1]?.name }} ({{ displayedFacetEndpoints[displayedFacetEndpoints.length - 1]?.count }})
      </div>
    </div>
  </div>
</template>
