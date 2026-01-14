<script setup lang="ts" generic="T">
import type { Column } from '@tanstack/table-core'
import type { CategoriesDistribution, Facet, FacetDistribution } from 'meilisearch'
import { ObservablePlotRender } from '#components'
import * as Plot from '@observablehq/plot'
import { useFrequencyPartition } from '../../../../../composables/useFrequencyPartition'

export interface CategoryHeaderProps<T> {
  column: Column<T>
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

const props = withDefaults(defineProps<CategoryHeaderProps<T>>(), {
  aggregateFrequencyThreshold: 0.015,
})
const currentFilterId = ref<string | undefined>(undefined)
const { aggregateFrequencyThreshold, addFilter } = props
const facetDistribution = toRef(props, 'facetDistribution')
// const maxValuesPerFacet = toRef(props, 'maxValuesPerFacet')
// const totalHits = toRef(props, 'totalHits')
const numberOfDocuments = toRef(props, 'numberOfDocuments')
const { column, label } = toRefs(props)
const modelFilter = defineModel<FacetFilter | undefined>('filter')

const facetCategoryDistribution = computed<CategoriesDistribution | undefined>(() => {
  const facetDistributionVal = toValue(facetDistribution)
  const columnId = toValue(column)?.id as Facet
  if (!facetDistributionVal || !columnId || !facetDistributionVal[columnId]) {
    return undefined
  }
  return facetDistributionVal[columnId]
})

// const facetCategoryCount = computed(() => {
//   const facetCategoryDistributionVal = toValue(facetCategoryDistribution)

//   if (!facetCategoryDistributionVal) {
//     return 0
//   }
//   return facetCategoryDistributionVal ? Object.keys(facetCategoryDistributionVal).length : 0
// })

// const isFacetCategoryDistributionPartial = computed(() => {
//   const facetCategoryCountVal = toValue(facetCategoryCount)
//   const maxValuesPerFacetVal = toValue(maxValuesPerFacet)
//   if (maxValuesPerFacetVal === undefined) {
//     return false
//   }
//   return facetCategoryCountVal >= maxValuesPerFacetVal
// })

const sanitizedFacetDistribution = computed<FacetCategory[]>(() => {
  const facetCategoryDistributionVal = toValue(facetCategoryDistribution)
  const numberOfDocumentsVal = toValue(numberOfDocuments)

  if (!facetCategoryDistributionVal) {
    return [] as FacetCategory[]
  }

  return Object.entries(facetCategoryDistributionVal).map(([key, value]) => ({
    name: key,
    count: value,
    frequency: numberOfDocumentsVal > 0 ? value / numberOfDocumentsVal : 0,
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

const { displayedItems, displayedItemCount } = useFrequencyPartition<FacetCategory>({
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

// const otherData = computed<FacetCategory[]>(() => {
//   const isPartial = toValue(isFacetCategoryDistributionPartial)

//   if (isPartial) {
//     return [
//       {
//         name: 'Other',
//         count: 100,
//       },
//     ]
//   }
//   else {
//     return []
//   }
// })

const plotOptions = computed(() => {
  // if true, should display an additional bar for "Other" category

  return {
    marginTop: 20,
    marginRight: 0,
    marginLeft: 0,
    width: 180,
    height: 40,
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
          fill: d => d.name === 'Other' ? 'var(--ui-color-neutral-300)' : 'var(--ui-color-primary-400)',
          inset: 0.4,
        }),
      ),

      Plot.text(
        normalizedHighFrequencyItems.value,
        Plot.pointerX(
          renameXPx(
            Plot.stackX({
              x: 'frequency',
              dx: -70,
              dy: -5,
              frameAnchor: 'top',
              textAnchor: 'start',
              lineAnchor: 'bottom',
              fontVariant: 'tabular-nums',
              textOverflow: 'ellipsis',
              text: (d: FacetCategory) => `${d.name}: ${d.count}`,
            }),
          ),
        ),
      ),

    ],
  }
})

// const otherPlotOptions = computed(() => {
//   return {
//     marginTop: 20,
//     marginRight: 0,
//     marginLeft: 10,
//     width: 100,
//     height: 40,
//     marginBottom: 0,
//     x: {
//       label: null,
//       tickSize: 0,
//       ticks: [],
//     },
//     y: {
//       label: null,
//       tickSize: 0,
//       ticks: [],
//     },
//     marks: [
//       Plot.barX(
//         otherData.value,
//         {
//           x: 'name',
//           y: 'count',
//           fill: 'orange',
//           inset: 0.4,
//         },

//       ),
//     ],
//   }
// })

function createFilter(value: string | Array<string>) {
  const filter = toValue(modelFilter)
  const columnVal = toValue(column)
  if (filter) {
    modelFilter.value = undefined
  }
  else {
    if (!columnVal) {
      console.warn('Column is undefined, cannot create filter')
    }
    if (addFilter) {
      if (Array.isArray(value)) {
        const { uuid } = addFilter({
          attribute: columnVal.id as Facet,
          type: 'set',
          operator: 'NOT IN',
          values: value,
        })
        return uuid
      }
      else {
        const { uuid } = addFilter({
          attribute: columnVal.id as Facet,
          type: 'comparison',
          operator: '=',
          values: value,
        })
        return uuid
      }
    }
  }
}

// function createOtherFilter(values: Array<string>) {
//   const columnVal = toValue(column)
//   if (!columnVal) {
//     console.warn('Column is undefined, cannot create filter')
//     return
//   }
//   if (addFilter) {
//     const { uuid } = addFilter({
//       attribute: columnVal.id as Facet,
//       type: 'set',
//       operator: 'NOT IN',
//       values,
//     })
//     return uuid
//   }
// }

// function clickOtherBar(plot) {
//   // console.log('other bar clicked', plot)
//   // console.log(plot.name)
//   // const plotValue = plot.value
//   const plotValue = true
//   if (plotValue) {
//     const values = Array.from(displayedItemIds.value).map(id => id.toString())
//     // console.log('other values', values)
//     createOtherFilter(values)
//   }
// }

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
  <div>
    <span v-if="label">
      {{ label }}
    </span>
    <div class="flex flex-row gap-1">
      <div v-if="sanitizedFacetDistribution.length > 0" class="mt-1">
        <ObservablePlotRender :options="plotOptions" defer :click-listener="handleBarClick" />
      </div>
      <!-- <div class="mt-1">
        <ObservablePlotRender :options="otherPlotOptions" defer :click-listener="clickOtherBar" />
      </div> -->
    </div>
  </div>
</template>
