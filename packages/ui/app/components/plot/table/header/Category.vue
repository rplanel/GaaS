<script lang="ts" setup>
import type { PlotOptions } from '@observablehq/plot'
import type { MosaicClient, Selection } from '@uwdata/mosaic-core'
import type { FilterExpr } from '@uwdata/mosaic-sql'
import { ObservablePlotRender } from '#components'
import * as Plot from '@observablehq/plot'
import { clausePoint, coordinator as defaultCoordinator, isParam, isSelection, makeClient } from '@uwdata/mosaic-core'
import { count, Query } from '@uwdata/mosaic-sql'
import * as d3 from 'd3'
import * as htl from 'htl'

interface Props {
  table: string
  variableId: string
  selection: Selection
  width?: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  width: 200,
  height: 70,
})

const coordinator = defaultCoordinator()
const selection = toRef(() => props.selection)
const table = toRef(() => props.table)
const variableId = toRef(() => props.variableId)
const width = toRef(() => props.width)
const height = toRef(() => props.height)

const categoryCount = ref<number>(0)
const isError = ref(false)
const isPending = ref(false)
const categoryFilter = ref<string | undefined>(undefined)
const data = ref<Array<Record<string, string> & { count: number }> | undefined>(undefined)
const filteredData = ref<Array<Record<string, string> & { count: number }> | undefined>(undefined)
const mosaicClient = ref<MosaicClient | undefined>(undefined)

/**
 * Create a mosaic client that fetches data from the specified table,
 */
watchEffect((onCleanup) => {
  const tableName = toValue(table)
  const variableName = toValue(variableId)
  // const categoryFilterVal = toValue(categoryFilter)

  const client = makeClient({
    coordinator,
    selection: selection.value,
    prepare: async () => {
      // Preparation work before the client starts.
      // Here we get the total number of rows in the table.

      const query = Query
        .from(tableName)
        .select(variableName, { count: count() })
        .groupby(variableName)

      // if (categoryFilterVal.length > 0) {
      //   query = query.where(isIn(variableName, categoryFilterVal.map(d => literal(d))))
      // }

      const result = await coordinator.query(
        query,
      )
      const groupedData = result.toArray()
      categoryCount.value = groupedData.length
      data.value = groupedData
      filteredData.value = groupedData
    },
    query: (predicate: FilterExpr) => {
      // Returns a query to retrieve the data.
      // The `predicate` is the selection's predicate for this client.
      // Here we use it to get the filtered count.

      const query = Query
        .from(tableName)
        .select(variableName, { count: count() })
        .where(predicate)
        .groupby(variableName)

      return query
    },
    queryResult: (queryData) => {
      // The query result is available.
      const groupedData = queryData.toArray()
      categoryCount.value = groupedData.length
      filteredData.value = groupedData
      isError.value = false
      isPending.value = false
    },
    queryPending: () => {
      // The query is pending.
      isPending.value = true
      isError.value = false
    },
    queryError: () => {
      // There is an error running the query.
      isPending.value = false
      isError.value = true
    },
  })
  mosaicClient.value = client
  onCleanup(() => {
    // Cleanup when the component is unmounted or the coordinator changes.
    client.destroy()
    mosaicClient.value = undefined
  })
})

const selectedCategory = computed(() => {
  const categoryFilterVal = toValue(categoryFilter)
  const dataVal = toValue(data)
  if (!dataVal || !categoryFilterVal) {
    return undefined
  }
  const selectedCategories = dataVal.filter(d => d[variableId.value] === categoryFilterVal)
  if (selectedCategories.length >= 0) {
    return selectedCategories[0]
  }
  return undefined
})

const { plotWidth, marginBottom, marginTop, marginLeft, marginRight } = useLayout(width, height)

function useLayout(width: Ref<number>, height: Ref<number>) {
  const marginTop = ref(0)
  const marginBottom = ref(0)
  const marginLeft = ref(0)
  const marginRight = ref(0)
  const plotHeight = ref(40)
  const plotWidth = computed(() => {
    const widthVal = toValue(width)
    return widthVal - marginLeft.value - marginRight.value
  })

  watchEffect(() => {
    const heightVal = toValue(height)
    if (heightVal > 40) {
      marginTop.value = heightVal - 40
    }
    plotHeight.value = heightVal - marginTop.value - marginBottom.value
  })

  return {
    plotHeight,
    marginBottom,
    marginTop,
    marginLeft,
    marginRight,
    plotWidth,
  }
}

const totalCount = computed(() => {
  if (!data.value) {
    return 0
  }
  return data.value.reduce((sum, item) => sum + item.count, 0)
})

const sortedData = computed(() => {
  if (!data.value) {
    return []
  }
  return data.value.map((d) => {
    return {
      ...d,
    }
  }).sort((a, b) => b.count - a.count)
})

const dataWithPercent = computed(() => {
  if (!sortedData.value) {
    return []
  }
  return sortedData.value.map(item => ({
    ...item,
    percent: d3.format('.1%')(totalCount.value > 0 ? (item.count / totalCount.value) : 0),
  }))
})
const hoveredCategory = ref<Record<string, string> & { count: number } | undefined>(undefined)

function normalizeCategoryName(name: string): string {
  return name.replace(/\s+/g, '-').toLowerCase()
}

const linearGradients = computed(() => {
  const sortedDataVal = toValue(dataWithPercent)
  const filteredDataVal = toValue(filteredData)
  const variableVal = toValue(variableId)
  if (filteredDataVal) {
    return sortedDataVal.map((item) => {
      const normalizeGradientId = normalizeCategoryName(item[variableVal])

      const filteredVal = filteredDataVal.find(d => d[variableVal] === item[variableVal])
      if (!filteredVal) {
        return htl.svg`<defs>
        <linearGradient id="gradient-${normalizeGradientId}" gradientTransform="rotate(90)">
          <stop offset="100%" stop-color="#ccc" />
        </linearGradient>
      </defs>`
      }

      let percentStop = 100
      percentStop = (filteredVal.count / item.count * 100)

      const gradient = percentStop < 100
        ? htl.svg`<defs>
        <linearGradient id="gradient-${normalizeGradientId}" gradientTransform="rotate(90)">
          <stop offset="${100 - percentStop}%" stop-color="#ccc" />
          <stop offset="${100 - percentStop}%" stop-color="var(--ui-secondary)" />
        </linearGradient>
      </defs>`
        : htl.svg`<defs>
        <linearGradient id="gradient-${normalizeGradientId}" gradientTransform="rotate(90)">
          <stop offset="${percentStop}%" stop-color="var(--ui-secondary)" />
        </linearGradient>
      </defs>`
      return gradient
    })
  }
  return []
})

const sortedDataWithGradient = computed(() => {
  const sortedDataVal = toValue(dataWithPercent)
  const variableVal = toValue(variableId)
  return sortedDataVal.map(item => ({
    ...item,
    gradient: `url(#gradient-${normalizeCategoryName(item[variableVal])})`,
  }))
})

const defaultBarOptions = {
  inset: 0.5,
  fillOpacity: 0.8,
  r: 2,
}

const plotOptions = computed<PlotOptions>(() => {
  return {
    width: toValue(plotWidth),
    marginTop: toValue(marginTop),
    marginBottom: toValue(marginBottom),
    marginLeft: toValue(marginLeft),
    marginRight: toValue(marginRight),
    height: toValue(height),
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
      ...linearGradients.value.map(gradient => () => gradient),
      Plot.barX(
        sortedDataWithGradient.value,
        Plot.stackX({

        }, Plot.pointerX({
          x: 'count',
          fill: 'var(--ui-color-secondary-50)',
          ...defaultBarOptions,
        })),
      ),
      Plot.barX(
        sortedDataWithGradient.value,
        Plot.stackX({
          x: 'count',
          fill: 'gradient',
          ...defaultBarOptions,
        }),
      ),

    ],
  }
})
const inputLabel = useTemplateRef('inputLabel')
function handleInput({ plot }) {
  // Handle input events here if needed
  if (plot.value) {
    hoveredCategory.value = plot.value
    // infoLabel.value = `${plot.value[variable.value]}: ${plot.value.count}`
  }
  else {
    hoveredCategory.value = undefined
    // infoLabel.value = `${categoryCount.value} categories`
  }
}
const infoLabel = computed(() => {
  const hoveredCategoryVal = toValue(hoveredCategory)
  if (hoveredCategoryVal) {
    return `${hoveredCategoryVal[variableId.value]}: ${hoveredCategoryVal.count} (${hoveredCategoryVal.percent})`
  }

  if (selectedCategory.value) {
    return `${selectedCategory.value[variableId.value]}: ${selectedCategory.value.count} (${selectedCategory.value.percent})`
  }
  return `${categoryCount.value} categories`
})
function publish(value) {
  const mosaicClientVal = toValue(mosaicClient)
  const selectionVal = toValue(selection)
  if (isSelection(selectionVal) && mosaicClientVal) {
    if (value === '' || value === null)
      value = undefined // 'All' option
    const clause = clausePoint(variableId.value, value, { source: mosaicClientVal })
    selection.value.update(clause)
  }
  else if (isParam(selectionVal)) {
    selection.value.update(value)
  }
}

function handleClick(plot) {
  // Handle input events here if needed
  const plotValue = plot.value
  if (plotValue) {
    const catergoryFilterVal = toValue(categoryFilter)
    const category = plotValue[variableId.value] as string
    if (category === catergoryFilterVal) {
      categoryFilter.value = undefined // Reset filter
    }
    else {
      categoryFilter.value = category // Set filter to clicked category
    }
  }
  else {
    categoryFilter.value = undefined // Reset filter if no value
  }
}

watch(categoryFilter, (newFilter) => {
  publish(newFilter)
})
</script>

<template>
  <div class="flex">
    <div class="flex flex-col items-center justify-center">
      <div v-if="data">
        <ObservablePlotRender
          :options="plotOptions"
          defer
          :input-listener="handleInput"
          :click-listener="handleClick"
        />
        <div
          ref="inputLabel"
          class="flex h-5 text-xs text-dimmed justify-center"
        >
          {{ infoLabel }}
        </div>
        <!-- <div v-if="selectedCategory">
          {{ selectedCategory[variable] }}
        </div> -->
      </div>
    </div>
  </div>
</template>
