<script lang="ts" setup>
import type { Sequence } from '../types/sequenceBrowser'
import * as d3 from 'd3'

export interface SequenceBrowserProps {
  title?: string | undefined
  sequences: Sequence[]
}

const props = withDefaults(defineProps<SequenceBrowserProps>(), { title: undefined })

const svgRef = useTemplateRef<SVGSVGElement>('svgRef')

onMounted(() => {
  if (!svgRef.value)
    return
  renderChart()
})

function renderChart() {
  if (!svgRef.value)
    return

  const svg = d3.select(svgRef.value)

  // create a group for all sequences
  const sequenceGrp = svg.append('g').attr('class', 'sequences')
  sequenceGrp
    .selectAll('g.sequence')
    .data<Sequence>(props.sequences)
    .join(
      (enter) => {
        return enter.append('g')
          .attr('class', 'sequence')
      },
      update => update,
      exit => exit.remove(),
    )
}
</script>

<template>
  <ClientOnly>
    <svg ref="svgRef" />
    <template #fallback>
      <div class="animate-pulse bg-gray-200 h-64 w-full rounded" />
    </template>
  </ClientOnly>
</template>
