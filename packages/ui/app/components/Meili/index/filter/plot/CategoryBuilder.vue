<script setup lang="ts" generic="T">
import type { Column } from '@tanstack/table-core'
import type { CategoriesDistribution, Facet, FacetDistribution } from 'meilisearch'
import { ObservablePlotRender } from '#components'
import * as Plot from '@observablehq/plot'

export interface CategoryHeaderProps<T> {
  column: Column<T>
  label?: string
  totalHits: number
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
const totalHits = toRef(props, 'totalHits')
const { column, label } = toRefs(props)

const modelFilter = defineModel<FacetFilter | undefined>('filter')

const sanitizedFacetDistribution = computed<FacetCategory[]>(() => {
  const facetDistributionVal = toValue(facetDistribution)
  const columnId = column.value.id as Facet
  const total = toValue(totalHits)

  if (!facetDistributionVal || !facetDistributionVal[columnId]) {
    return []
  }
  const facetCategory: CategoriesDistribution = facetDistributionVal[columnId]
  return Object.entries(facetCategory).map(([key, value]) => ({
    name: key,
    count: value,
    frequency: total > 0 ? value / total : 0,
  }))
})

const itemsCountInFacet = computed(() => sanitizedFacetDistribution.value.reduce((sum, item) => sum + item.count, 0))

function aggregateLowFrequencyItems(items: FacetCategory[]): FacetCategory {
  // const otherGroup: FacetCategory = { name: 'Other', count: 0, frequency: 0 }
  const total = toValue(totalHits)
  const countHitsInFacet = toValue(itemsCountInFacet)
  let missingItems = 0
  // there is not all the data in the facet distribution
  // count the missing items in the other group
  if (total > countHitsInFacet) {
    missingItems = total - countHitsInFacet
  }

  const otherGroup = items.reduce((group, curr) => {
    group.count += curr.count

    group.items?.push(curr.name)
    // group.frequency = total > 0 ? group.count / total : 0
    return group
  }, { name: 'Other', count: 0, frequency: 0, items: [] as string[] })
  const otherCount = otherGroup.count + missingItems
  return {
    ...otherGroup,
    count: otherCount,
    frequency: total > 0 ? otherCount / total : 0,
  }
}

const { groupedItems, highFrequencyItemIds } = useGroupLowFrequency<FacetCategory>({
  items: sanitizedFacetDistribution,
  getId: item => item.name,
  getFrequency: item => item.frequency,
  threshold: aggregateFrequencyThreshold,
  aggregateFn: aggregateLowFrequencyItems,
})

function renameXPx({ x, ...options }) {
  return { ...options, px: x }
}

const plotOptions = computed(() => {
  return {
    marginTop: 20,
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
        groupedItems.value,
        Plot.stackX({
          x: 'frequency',
          fill: d => d.name === 'Other' ? 'var(--ui-color-neutral-300)' : 'var(--ui-color-primary-400)',
          inset: 0.4,
        }),
      ),
      Plot.text(
        groupedItems.value,
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
              text: (d: FacetCategory) => `${d.name}: ${d.count} (${(d.frequency * 100).toFixed(1)}%)`,
            }),
          ),
        ),
      ),
    ],
  }
})

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

function handleBarClick(plot) {
  const plotValue = plot.value
  // console.log('bar clicked', plotValue)
  if (plotValue) {
    const value = plotValue.name
    if (value !== 'Other') {
      currentFilterId.value = createFilter(value)
    }
    else {
      currentFilterId.value = createFilter(Array.from(highFrequencyItemIds.value).map(id => id.toString()))
    }
  }
}
</script>

<template>
  <div>
    <span v-if="label">
      {{ label }}
    </span>
    <div v-if="sanitizedFacetDistribution.length > 0" class="mt-1">
      <ObservablePlotRender :options="plotOptions" defer :click-listener="handleBarClick" />
    </div>
  </div>
</template>
