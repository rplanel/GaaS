<script lang="ts" setup>
import type { Coordinator, Selection } from '@uwdata/mosaic-core'
import { PlotRange } from '#components'
import * as vg from '@uwdata/vgplot'
import { usePlotLayout } from '../../../../composables/plot/usePlotLayout'

interface Props {
  table: string
  variable: string
  selection: Selection
  coordinator: Coordinator
  width?: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  width: 200,
  height: 70,
})

const container = useTemplateRef('container')

const selection = props.selection
const table = toRef(() => props.table)
const variable = toRef(() => props.variable)
const coordinator = props.coordinator
const width = toRef(() => props.width)
const height = toRef(() => props.height)
const initMarginTop = ref(4)

const defaultRectYAttributes = {
  inset: 0.5,
  fillOpacity: 0.8,
}
const { marginBottom, marginTop, marginLeft, marginRight } = usePlotLayout({
  width,
  height,
  marginTop: initMarginTop,
})

const marks = computed(() => {
  const tableVal = toValue(table)
  const variableVal = toValue(variable)
  const selectionVal = selection

  return [
    vg.rectY(vg.from(tableVal, {}), {
      x: vg.bin(variableVal),
      y: vg.count(),
      fill: '#ccc',
      ...defaultRectYAttributes,
    }),
    vg.rectY(vg.from(tableVal, { filterBy: selectionVal }), {
      x: vg.bin(variableVal),
      y: vg.count(),
      fill: 'var(--ui-secondary)',
      // tip: true,
      ...defaultRectYAttributes,
    }),
  ]
})

const plot = computed(() => {
  const selectionVal = toValue(selection)
  const marksVal = toValue(marks)
  // const mark = vg.rectY(vg.from(tableVal, {}), {
  //   x: vg.bin(variableVal),
  //   y: vg.count(),
  //   fill: "#ccc",
  //   ...defaultRectYAttributes,
  // });

  const dataPlot = vg.plot(
    vg.name(`histogram-${toValue(variable)}`),
    // vg.frame('#ccc'),
    ...marksVal,

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
onUnmounted(() => {
  console.warn('Unmounting histogram plot for variable:', toValue(variable))
})
</script>

<template>
  <!-- The histogram plot will be rendered inside this container -->
  <div class="flex flex-row">
    <div class="flex flex-col">
      <!-- this is the plot container -->
      <div ref="container" />
      <PlotRange :table="table" :variable="variable" :selection="selection" :coordinator="coordinator" />
    </div>
  </div>
</template>
