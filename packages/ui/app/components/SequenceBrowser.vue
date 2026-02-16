<script lang="ts" setup>
import type { Sequence, SequenceCluster, Strand } from '../types/sequenceBrowser'
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
  initialVisibleCount: 60,
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
const geneHeight = 30

// Clustering configuration
const CLUSTER_THRESHOLD = 300 // Switch from sequences to clusters when exceeding this count
const BIN_COUNT = 50 // Number of bins to create across the viewport

// Helper interface for binning operations
interface Bin {
  start: number
  end: number
  sequences: Sequence[]
}

// Create spatial bins of sequences for clustering when zoomed out
function createBins(
  sequences: Sequence[],
  viewStart: number,
  viewEnd: number,
): SequenceCluster[] {
  const binWidth = (viewEnd - viewStart) / BIN_COUNT
  const bins: Bin[] = Array.from({ length: BIN_COUNT }, (_, i) => ({
    start: viewStart + i * binWidth,
    end: viewStart + (i + 1) * binWidth,
    sequences: [],
  }))

  // Assign sequences to bins they overlap with
  sequences.forEach((seq) => {
    const seqStart = seq.start ?? 0
    const seqEnd = seq.end ?? seqStart + seq.length
    const startBin = Math.floor((seqStart - viewStart) / binWidth)
    const endBin = Math.floor((seqEnd - viewStart) / binWidth)

    for (let i = Math.max(0, startBin); i <= Math.min(bins.length - 1, endBin); i++) {
      bins[i].sequences.push(seq)
    }
  })

  // Convert non-empty bins to cluster objects
  return bins
    .filter(b => b.sequences.length > 0)
    .map((b, i) => ({
      id: `cluster-${i}`,
      name: `Cluster ${i + 1} (${b.sequences.length} sequences)`,
      type: 'cluster' as const,
      start: b.start,
      end: b.end,
      count: b.sequences.length,
      sequences: b.sequences,
    }))
}

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
// Uses viewport culling: only render visible items
// When viewing many sequences (>CLUSTER_THRESHOLD), uses spatial clustering
function updatePositions() {
  if (!svgRef.value)
    return

  const svg = d3.select(svgRef.value)
  const y = (innerHeight.value - geneHeight) / 2

  // Get visible sequences in current viewport
  const visibleSequences = getVisibleSequences(currentXScale)
  const [viewStart, viewEnd] = currentXScale.domain()

  // Determine if we need clustering (too many visible items)
  const useClusters = visibleSequences.length > CLUSTER_THRESHOLD

  // Get display data: either clusters or sequences
  const displayData = useClusters
    ? createBins(visibleSequences, viewStart, viewEnd)
    : visibleSequences

  // Determine maximum count for cluster height scaling
  const maxCount = useClusters
    ? Math.max(...(displayData as SequenceCluster[]).map(d => d.count))
    : 1

  // Data join on the display items using d3.join syntax
  svg.select('g.sequences')
    .selectAll<SVGGElement, Sequence | SequenceCluster>('g.item')
    .data(displayData, d => d.id)
    .join(
      // Enter: create new group structure
      (enter) => {
        return enter.append('g')
          .attr('class', 'item')
          .style('cursor', 'pointer')
          .on('click', (event, d) => {
            event.stopPropagation()
            if ('type' in d && d.type === 'cluster') {
              zoomToRegion(d.start, d.end)
            }
          })
          .call((g) => {
            g.append('path')
              .attr('class', 'item-shape')
              .attr('fill', 'steelblue')
            g.append('text')
              .attr('class', 'item-label')
              .attr('dy', '0.35em')
              .attr('text-anchor', 'middle')
              .attr('font-size', '10px')
              .attr('fill', 'white')
              .style('pointer-events', 'none')
            g.append('title')
          })
      },
      // Update: existing elements
      update => update,
      // Exit: remove elements
      exit => exit.remove(),
    )
    // Apply position and style to merged enter + update selection
    .attr('transform', (d) => {
      const start = d.start ?? 0
      return `translate(${currentXScale(start)}, ${y})`
    })
    .each(function (d) {
      const g = d3.select(this)
      const start = d.start ?? 0
      const end = d.end ?? start + (d as Sequence).length
      const width = Math.max(1, currentXScale(end) - currentXScale(start))

      if ('type' in d && d.type === 'cluster') {
        // Render cluster: height proportional to count
        const density = d.count / maxCount
        const clusterHeight = Math.max(4, geneHeight * (0.3 + 0.7 * density))
        const offsetY = (geneHeight - clusterHeight) / 2

        g.select('path.item-shape')
          .transition()
          .duration(100)
          .attr('d', `M0,${offsetY} h${width} v${clusterHeight} h-${width} z`)
          .attr('fill', '#4a90a4')
          .attr('opacity', 0.7 + 0.3 * density)

        // Show count label if bin is wide enough
        g.select('text.item-label')
          .text(width > 20 ? d.count : '')
          .attr('x', width / 2)
          .attr('y', geneHeight / 2)

        g.select('title')
          .text(`Cluster: ${d.count} sequences\nRange: ${Math.round(start)} - ${Math.round(end)}`)
      }
      else {
        // Render individual sequence
        const itemShape = g.select('path.item-shape')
        // .transition()
        // .duration(100)
        itemShape.attr('d', drawGene(width, geneHeight, d.strand))

        itemShape
          .transition()
          .duration(100)
          .attr('fill', 'steelblue')
          .attr('opacity', 1)

        g.select('text.item-label')
          .text('')

        g.select('title')
          .text(d.name)
      }
    })

  // Update x-axis with current scale
  svg.select<SVGGElement>('g.x-axis')
    .call(d3.axisBottom(currentXScale).ticks(Math.max(2, Math.floor(innerWidth.value / 100))))
}

// Zoom behavior — semantic zoom on x-axis, purely imperative
const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([1, Infinity])
  .filter(event => !event.type.startsWith('dblclick'))
  .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
    // Rescale x only (semantic zoom)
    currentXScale = event.transform.rescaleX(baseXScale.value)
    updatePositions()
  })

// Function to zoom into a specific region
function zoomToRegion(start: number, end: number) {
  if (!svgRef.value)
    return

  const span = end - start
  const padding = span * 0.1 // 10% padding
  const targetStart = Math.max(0, start - padding)
  const targetEnd = end + padding
  const fullExtent = baseXScale.value.domain()[1] - baseXScale.value.domain()[0]

  // Calculate scale factor needed
  const k = fullExtent / (targetEnd - targetStart)

  // Limit max zoom
  const maxK = 50
  const finalK = Math.min(k, maxK)

  // Calculate translation
  const baseS = baseXScale.value
  const tx = -finalK * baseS(targetStart)

  const transform = d3.zoomIdentity.translate(tx, 0).scale(finalK)

  d3.select(svgRef.value)
    .transition()
    .duration(500)
    .call(zoomBehavior.transform, transform)
}

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
  svg
    .call(zoomBehavior)
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
