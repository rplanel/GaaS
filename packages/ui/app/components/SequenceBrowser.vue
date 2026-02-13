<script lang="ts" setup>
import type { Sequence } from '../types/sequenceBrowser'
import * as d3 from 'd3'

export interface SequenceBrowserProps {
  title?: string | undefined
  sequences: Sequence[]
  width?: number
  height?: number
}

const props = withDefaults(defineProps<SequenceBrowserProps>(), {
  title: undefined,
  width: 800,
  height: 400,
})

const margin = { top: 20, right: 20, bottom: 20, left: 20 }
const innerWidth = computed(() => props.width - margin.left - margin.right)
const innerHeight = computed(() => props.height - margin.top - margin.bottom)

const svgRef = useTemplateRef<SVGSVGElement>('svgRef')
const isClientReady = ref(false)

const warnings = ref<string[]>([])

const validatedSequences = computed(() => {
  return props.sequences.map((seq) => {
    const start = seq.start ?? 0
    const end = seq.end ?? start + seq.length
    const computedLength = end - start
    if (seq.length !== computedLength) {
      warnings.value.push(`Sequence ${seq.id} has inconsistent length. Computed length based on start and end is ${computedLength}, but length property is ${seq.length}. Using computed length.`)
      seq.length = computedLength
    }
    return {
      ...seq,
      start,
      end,
    }
  })
})

// Compute the genomic extent across all sequences (min start to max end)
const sequenceExtent = computed(() => {
  if (props.sequences.length === 0) {
    return [0, 1] as [number, number]
  }

  const minStart = d3.min(validatedSequences.value, d => d.start ?? 0) ?? 0
  const maxEnd = d3.max(validatedSequences.value, d => d.end ?? (d.start ?? 0) + d.length) ?? 1

  return [minStart, maxEnd] as [number, number]
})

// X scale: maps sequence coordinates to pixel coordinates
const xScale = computed(() => {
  return d3.scaleLinear()
    .domain(sequenceExtent.value)
    .range([0, innerWidth.value])
})

onMounted(() => {
  isClientReady.value = true
  nextTick(() => {
    renderChart()
  })
})

watch([() => props.sequences, () => props.width, () => props.height], () => {
  if (isClientReady.value) {
    renderChart()
  }
}, { deep: true })

function drawSequenceElement(selection: d3.Selection<SVGGElement, Sequence, null, undefined>): void {
  const data = selection.datum()
  const start = data.start ?? 0
  const end = data.end ?? start + data.length
  const x = xScale.value(start)
  const width = xScale.value(end) - xScale.value(start)
  const y = innerHeight.value / 2 - 10
  const height = 20
  const strand = data.strand

  // Handle enter/update/exit for the drawing element inside this group
  selection.selectAll<SVGPathElement, Sequence>('.sequence-draw')
    .data([data])
    .join(
      enter => enter.append('path')
        .attr('class', 'sequence-draw')
        .attr('fill', 'steelblue'),
      exit => exit.remove(),
    )
    .attr('d', () => {
      if (strand === undefined) {
        // Draw rectangle as path
        return `M${x},${y} `
          + `L${x + width},${y} `
          + `L${x + width},${y + height} `
          + `L${x},${y + height} `
          + 'Z'
      }

      // Has strand - draw arrow
      const arrowHeadWidth = Math.min(width * 0.4, 15)
      const bodyWidth = Math.max(0, width - arrowHeadWidth)

      if (strand === 1) {
        // Right arrow
        const bodyEnd = x + bodyWidth
        const arrowTip = x + width
        const midY = y + height / 2

        return `M${x},${y} `
          + `L${bodyEnd},${y} `
          + `L${arrowTip},${midY} `
          + `L${bodyEnd},${y + height} `
          + `L${x},${y + height} `
          + 'Z'
      }
      else {
        // Left arrow
        const bodyStart = x + arrowHeadWidth
        const arrowTip = x
        const midY = y + height / 2

        return `M${bodyStart},${y} `
          + `L${x + width},${y} `
          + `L${x + width},${y + height} `
          + `L${bodyStart},${y + height} `
          + `L${arrowTip},${midY} `
          + 'Z'
      }
    })
}

function renderChart() {
  if (!svgRef.value)
    return

  const svg = d3.select(svgRef.value)

  // create a group for all sequences with margin offset
  const sequenceGrp = svg.select('g.sequences')
    .attr('transform', `translate(${margin.left}, ${margin.top})`)

  // Join for sequence groups
  const seqGroups = sequenceGrp
    .selectAll<SVGGElement, Sequence>('g.sequence')
    .data<Sequence>(props.sequences, d => d.id)
    .join(
      enter => enter.append('g').attr('class', 'sequence'),
      update => update,
      exit => exit.remove(),
    )

  // Call drawSequenceElement on all groups (enter + update)
  seqGroups.each(function () {
    d3.select<SVGGElement, Sequence>(this).call(drawSequenceElement)
  })
}
</script>

<template>
  <div>
    <ClientOnly>
      <svg ref="svgRef" :width="width" :height="height">
        <g class="sequences" />
      </svg>
      <template #fallback>
        <!-- Genome browser skeleton -->
        <div class="flex flex-col gap-2 p-2 " :style="{ width: `${width}px`, height: `${height}px` }">
          <!-- Sequence tracks -->
          <div class="flex flex-col gap-3 flex-1">
            <!-- Track 1: genes/features -->
            <div class="flex items-center gap-2">
              <USkeleton class="h-4 w-20 shrink-0" />
              <div class="flex items-center gap-1 flex-1">
                <USkeleton class="h-6 w-24" />
                <USkeleton class="h-6 w-16" />
                <USkeleton class="h-6 w-32" />
                <USkeleton class="h-6 w-12" />
                <USkeleton class="h-6 w-28" />
                <USkeleton class="h-6 w-20" />
                <USkeleton class="h-6 w-24" />
                <USkeleton class="h-6 w-16" />
                <USkeleton class="h-6 w-12" />
                <USkeleton class="h-6 w-32" />
                <USkeleton class="h-6 w-18" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </ClientOnly>
    <UAlert
      v-for="(warning, index) in warnings"
      :key="index"
      color="warning"
      variant="subtle"
      icon="i-heroicons-exclamation-triangle"
      closable
      :title="warning"
      class="mt-1"
    />
  </div>
</template>
