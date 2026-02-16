<script lang="ts" setup>
import type { Sequence, Strand } from '../types/sequenceBrowser'
import * as d3 from 'd3'

export interface SequenceBrowserProps {
  title?: string | undefined
  sequences: Sequence[]
  width?: number
  height?: number
  initialVisibleCount?: number
}

const props = withDefaults(defineProps<SequenceBrowserProps>(), {
  title: undefined,
  width: 800,
  height: 400,
  initialVisibleCount: 50,
})

const margin = { top: 10, right: 20, bottom: 30, left: 20 }
const innerWidth = computed(() => props.width - margin.left - margin.right)
const innerHeight = computed(() => props.height - margin.top - margin.bottom)

const svgRef = useTemplateRef<SVGSVGElement>('svgRef')
const isClientReady = ref(false)

const validatedSequences = computed(() => {
  return props.sequences.map((seq) => {
    const start = seq.start ?? 0
    const end = seq.end ?? start + seq.length
    return {
      ...seq,
      start,
      end,
      length: end - start,
    }
  })
})

// Compute warnings separately to avoid side effects in computed
const warnings = computed(() => {
  const w: string[] = []
  for (const seq of props.sequences) {
    const start = seq.start ?? 0
    const end = seq.end ?? start + seq.length
    const computedLength = end - start
    if (seq.length !== computedLength) {
      w.push(`Sequence ${seq.id} has inconsistent length. Computed length based on start and end is ${computedLength}, but length property is ${seq.length}. Using computed length.`)
    }
  }
  return w
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

// Base X scale (unzoomed) - Vue computed, only recalculates when data/dimensions change
const baseXScale = computed(() => {
  return d3.scaleLinear()
    .domain(sequenceExtent.value)
    .range([0, innerWidth.value])
})

// Pre-sorted sequences for fast binary search during viewport culling
const sortedSequences = computed(() => {
  return [...validatedSequences.value].sort((a, b) => a.start - b.start)
})

// Bisector for fast lookup by start position
const bisectStart = d3.bisector<Sequence, number>(d => d.start).right
const bisectEnd = d3.bisector<Sequence, number>(d => d.end ?? d.start + d.length).left

// Get the visible subset of sequences for the current viewport — O(log n) with binary search
function getVisibleSequences(scale: d3.ScaleLinear<number, number>): Sequence[] {
  const sorted = sortedSequences.value
  if (sorted.length === 0)
    return []

  const [viewStart, viewEnd] = scale.domain()

  // Find sequences whose end >= viewStart and start <= viewEnd
  // bisectEnd finds the first sequence whose end is >= viewStart
  const lo = bisectEnd(sorted, viewStart)
  // bisectStart finds the first sequence whose start is > viewEnd
  const hi = bisectStart(sorted, viewEnd)

  return sorted.slice(Math.max(0, lo - 1), Math.min(sorted.length, hi + 1))
}
// Plain variable for the zoom-adjusted scale (NOT reactive - avoids Vue overhead during zoom)
let currentXScale: d3.ScaleLinear<number, number> = d3.scaleLinear()
const geneHeight = 20

// Build a gene arrow path relative to (0,0) using d3.path() — cleaner than string concatenation
function drawGene(width: number, height: number, strand?: Strand): string {
  const context = d3.path()
  const halfHeight = height / 2
  const arrowHead = Math.min(halfHeight, width)

  if (strand === -1) {
    // Left-pointing arrow
    context.moveTo(0, halfHeight)
    if (arrowHead < width)
      context.lineTo(arrowHead, 0)
    context.lineTo(width, 0)
    context.lineTo(width, height)
    if (arrowHead < width)
      context.lineTo(arrowHead, height)
    context.closePath()
  }
  else if (strand === 1) {
    // Right-pointing arrow
    context.moveTo(0, 0)
    if (arrowHead < width)
      context.lineTo(width - arrowHead, 0)
    context.lineTo(width, halfHeight)
    if (arrowHead < width)
      context.lineTo(width - arrowHead, height)
    context.lineTo(0, height)
    context.closePath()
  }
  else {
    // Rectangle (no strand)
    context.rect(0, 0, width, height)
  }

  return context.toString()
}

// Imperative position update — called on every zoom frame, no Vue reactivity involved
// Uses viewport culling: only join + render the genes visible in the current view
function updatePositions() {
  if (!svgRef.value)
    return

  const svg = d3.select(svgRef.value)
  const y = (innerHeight.value - geneHeight) / 2

  // Get only the genes visible in the current viewport (O(log n) binary search)
  const visible = getVisibleSequences(currentXScale)

  // Data join on the visible subset — D3 removes off-screen nodes, adds newly visible ones
  svg.select('g.sequences')
    .selectAll<SVGGElement, Sequence>('g.sequence')
    .data(visible, d => d.id)
    .join(
      (enter) => {
        const g = enter.append('g').attr('class', 'sequence')
        g.append('path')
          .attr('class', 'sequence-draw')
          .attr('fill', 'steelblue')
        g.append('title')
          .text(d => d.name)
        return g
      },
      update => update,
      exit => exit.remove(),
    )
    .attr('transform', (d) => {
      const start = d.start ?? 0
      return `translate(${currentXScale(start)}, ${y})`
    })
    .select<SVGPathElement>('path.sequence-draw')
    .attr('d', (d) => {
      const start = d.start ?? 0
      const end = d.end ?? start + d.length
      const w = Math.max(0, currentXScale(end) - currentXScale(start))
      return drawGene(w, geneHeight, d.strand)
    })

  // Update x-axis with current scale
  svg.select<SVGGElement>('g.x-axis')
    .call(d3.axisBottom(currentXScale).ticks(Math.max(2, Math.floor(innerWidth.value / 100))))
}

// Zoom behavior — semantic zoom on x-axis, purely imperative
const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.5, 4])
  .filter(event => !event.type.startsWith('dblclick'))
  .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
    // Rescale x only (semantic zoom)
    currentXScale = event.transform.rescaleX(baseXScale.value)
    updatePositions()
  })

// Update zoom constraints to match current dimensions (called before each svg.call(zoomBehavior))
function updateZoomConstraints() {
  const w = innerWidth.value
  const h = innerHeight.value
  zoomBehavior
    .extent([[0, 0], [w, h]])
    .translateExtent([[0, -Infinity], [w, Infinity]])
}

// Compute the initial zoom transform to show only the first N sequences
function getInitialTransform(): d3.ZoomTransform {
  const sorted = sortedSequences.value
  if (sorted.length === 0 || props.initialVisibleCount >= sorted.length)
    return d3.zoomIdentity

  const n = Math.min(props.initialVisibleCount, sorted.length)
  const firstStart = sorted[0].start
  const lastEnd = sorted[n - 1].end ?? sorted[n - 1].start + sorted[n - 1].length

  // We need a transform T such that T.rescaleX(baseXScale) maps [firstStart, lastEnd] to [0, innerWidth]
  // k = fullRange / subRange, tx = -k * baseXScale(firstStart)
  const base = baseXScale.value
  const x0 = base(firstStart)
  const x1 = base(lastEnd)
  const subRange = x1 - x0
  if (subRange <= 0)
    return d3.zoomIdentity

  const k = innerWidth.value / subRange
  const tx = -k * x0
  return d3.zoomIdentity.translate(tx, 0).scale(k)
}

// Full render — sets up structure + initial positions. Called on mount and when data changes.
function renderChart() {
  if (!svgRef.value)
    return

  const svg = d3.select(svgRef.value)

  // Clip path for the sequence area
  const defs = svg.selectAll('defs').data([null]).join('defs')
  const clipPath = defs.selectAll('clipPath#chart-clip').data([null]).join('clipPath').attr('id', 'chart-clip')
  clipPath.selectAll('rect').data([null]).join('rect').attr('width', innerWidth.value).attr('height', innerHeight.value)

  // Update zoom constraints to match current dimensions, then apply
  updateZoomConstraints()
  const initialTransform = getInitialTransform()
  currentXScale = initialTransform.rescaleX(baseXScale.value)
  svg.call(zoomBehavior)
    .call(zoomBehavior.transform, initialTransform)

  // Chart group with margin
  const chartGrp = svg.select('g.chart')
    .attr('transform', `translate(${margin.left}, ${margin.top})`)

  // Sequences group with clipping
  chartGrp.select('g.sequences')
    .attr('clip-path', 'url(#chart-clip)')

  // X-axis position
  chartGrp.select<SVGGElement>('g.x-axis')
    .attr('transform', `translate(0, ${innerHeight.value})`)

  // Apply positions using the current scale (this does the data join for visible genes)
  updatePositions()
}

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
</script>

<template>
  <div>
    <ClientOnly>
      <svg ref="svgRef" :width="width" :height="height" style="cursor: grab;">
        <g class="chart">
          <g class="sequences" />
          <g class="x-axis" />
        </g>
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
