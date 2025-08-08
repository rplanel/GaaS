<script lang="ts" setup>
import { PlotRange } from '#components'
import { coordinator as defaultCoordinator } from '@uwdata/mosaic-core'
import * as vg from '@uwdata/vgplot'

interface Props {
  table: string
  variable: string
  selection: Selection
  width?: number
  height?: number

}

const props = withDefaults(defineProps<Props>(), {
  width: 200,
  height: 70,
})

const container = useTemplateRef('container')

const selection = toRef(() => props.selection)
const table = toRef(() => props.table)
const variable = toRef(() => props.variable)
// const coordinator = toRef(() => props.coordinator)
const coordinator = defaultCoordinator()
const width = toRef(() => props.width)
const height = toRef(() => props.height)

const defaultRectYAttributes = {
  inset: 0.5,
  fillOpacity: 0.8,

}

// const { data: nullData } = useNullValues(
//   table,
//   variable,
// )

// function useNullValues(table: Ref<string>, variableId: Ref<string>,
// ) {
//   const data = ref<Array<Record<string, string> & { count: number }> | undefined>(undefined)

//   const isError = ref(false)
//   const isPending = ref(false)
//   const mosaicClient = ref<MosaicClient | undefined>(undefined)

//   watchEffect((onCleanup) => {
//     const tableName = toValue(table)
//     const variableName = toValue(variableId)
//     const client = makeClient({
//       coordinator,
//       selection: selection.value,
//       prepare: async () => {
//       // Preparation work before the client starts.
//       // Here we get the total number of rows in the table.

//         const query = Query
//           .from(tableName)
//           .select({ count: count(variableName) })
//           // .groupby(variableName)
//           .where(vg.isNull(variableName))

//         // if (categoryFilterVal.length > 0) {
//         //   query = query.where(isIn(variableName, categoryFilterVal.map(d => literal(d))))
//         // }

//         const result = await coordinator.query(
//           query,
//         )
//         const groupedData = result.toArray()
//         data.value = groupedData.map(d => ({
//           ...d,
//           name: 'null',
//         }))
//       },
//       query: (predicate: FilterExpr) => {
//       // Returns a query to retrieve the data.
//       // The `predicate` is the selection's predicate for this client.
//       // Here we use it to get the filtered count.

//         const query = Query
//           .from(tableName)
//           .select({ count: count(variableName) })
//           .where(predicate)
//           // .groupby(variableName)

//         return query
//       },
//       queryResult: (queryData) => {
//       // The query result is available.
//         data.value = queryData.toArray().map(d => ({
//           ...d,
//           name: 'null',
//         }))
//         isError.value = false
//         isPending.value = false
//       },
//       queryPending: () => {
//       // The query is pending.
//         isPending.value = true
//         isError.value = false
//       },
//       queryError: () => {
//       // There is an error running the query.
//         isPending.value = false
//         isError.value = true
//       },
//     })
//     mosaicClient.value = client
//     onCleanup(() => {
//     // Cleanup when the component is unmounted or the coordinator changes.
//       client.destroy()
//       mosaicClient.value = undefined
//     })
//   })
//   return { data, isError, isPending, mosaicClient }
// }

// const { plotHeight, marginBottom, marginTop, marginLeft, marginRight } = useLayout(width, height)
const { marginBottom, marginTop, marginLeft, marginRight } = usePlotLayout({ width, height })

// const maxCount = computed(() => {
//   const max = 0
// })
// const plotOptions = computed<PlotOptions>(() => {
//   return {
//     width: 40,
//     height: 100,
//     marginLeft: toValue(tableHeaderPadding),
//     marginRight: toValue(tableHeaderPadding),
//     y: {
//       label: null,
//       tickSize: 0,
//       ticks: [],
//     },
//     x: {
//       label: '∅',
//       tickSize: 0,
//       ticks: [],
//     },
//     marks: [
//       Plot.barY(
//         toValue(nullData),
//         {
//           x: 'name',
//           y: 'count',
//           fill: 'orange',
//           inset: 0.5,
//           fillOpacity: 0.8,
//           tip: true,
//         },
//       ),
//     ],
//   }
// })

const plot = computed(() => {
  const variableVal = toValue(variable)
  const selectionVal = toValue(selection)
  const tableVal = toValue(table)

  const mark = vg.rectY(
    vg.from(tableVal, {}),
    {
      x: vg.bin(variableVal),
      y: vg.count(),
      fill: '#ccc',
      ...defaultRectYAttributes,
    },
  )
  const dataPlot = vg.plot(
    // vg.frame('#ccc'),
    mark,
    vg.rectY(
      vg.from(tableVal, { filterBy: selectionVal }),
      {
        x: vg.bin(variableVal),
        y: vg.count(),
        fill: 'var(--ui-secondary)',
        // tip: true,
        ...defaultRectYAttributes,
      },
    ),

    vg.intervalX({ as: selectionVal }),
    vg.marginLeft(toValue(marginLeft)),
    vg.marginRight(toValue(marginRight)),
    vg.marginTop(toValue(marginTop)),
    vg.marginBottom(toValue(marginBottom)),
    vg.xTicks(0),
    vg.xLabel(null),
    vg.xTickSize(0),
    vg.xLine(0),
    vg.yAxis(null),
    vg.xDomain(vg.Fixed),
    vg.yDomain(vg.Fixed),
    vg.width(width.value),
    vg.height(height.value),

  )

  return dataPlot
})

onMounted(() => {
  const containerVal = toValue(container)
  const plotVal = toValue(plot)
  if (containerVal) {
    containerVal.appendChild(plotVal)
  }
})
</script>

<template>
  <!-- The histogram plot will be rendered inside this container -->
  <div class="flex flex-row">
    <div class="flex flex-col">
      <!-- this is the plot container -->
      <div ref="container" />
      <PlotRange
        :table="table"
        :variable="variable"
        :selection="selection"
        :coordinator
      />
    </div>
    <!-- <div>
      <ObservablePlotRender
        v-if="nullData"
        :options="plotOptions"
        defer
        :input-listener="({ plot, event }) => {
          console.log('input', event)
          console.log('plot', plot.value)
        }"
      />
    </div> -->
  </div>
</template>
