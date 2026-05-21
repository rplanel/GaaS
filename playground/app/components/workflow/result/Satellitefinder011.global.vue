<script lang="ts" setup>
import type { Sequence } from '#layers/@gaas/ui/app/types/sequenceBrowser'
import type { AnalysisInputWithStoragePathRow, AnalysisOutputWithStoragePathRow, Database, DatasetBlob } from 'nuxt-galaxy'
import type { Seq } from 'seqparse'
import { parseFile } from 'seqparse'
import { ref, watch } from 'vue'

interface Props {
  analysisId: number
}

const props = withDefaults(defineProps<Props>(), {})

const analysisId = toRef(() => props.analysisId)
const supabase = useSupabaseClient<Database>()

const { data } = useQuery({
  ...analysisDatasetsQuery({ analysisId: analysisId.value!, supabase }),
  enabled: () => !!analysisId.value,
})

const inputBlobs = computed((): DatasetBlob<AnalysisInputWithStoragePathRow>[] => data.value?.[0] ?? [])
const outputBlobs = computed((): DatasetBlob<AnalysisOutputWithStoragePathRow>[] => data.value?.[1] ?? [])

interface ParsedInput {
  entry: AnalysisInputWithStoragePathRow
  sequences: Seq[]
  browserSequences: Sequence[]
}

const parsedInputs = ref<ParsedInput[]>([])

interface ParsedOutput {
  entry: AnalysisOutputWithStoragePathRow
  text: string
}

const parsedOutputs = ref<ParsedOutput[]>([])

watch(
  outputBlobs,
  async (blobs) => {
    if (!blobs.length) {
      parsedOutputs.value = []
      return
    }
    const results = await Promise.all(
      blobs.map(async (item) => {
        const text = await item.blob.text()
        return { entry: item.entry, text }
      }),
    )
    parsedOutputs.value = results
  },
  { immediate: true },
)

function transformToBrowserSequences(seqs: Seq[]): Sequence[] {
  let currentOffset = 0
  const padding = 10

  return seqs.map((seq, index): Sequence => {
    const start = currentOffset
    const length = seq.seq.length
    const end = start + length
    currentOffset = end + padding

    return {
      id: `seq-${index}`,
      name: seq.name || `Sequence ${index + 1}`,
      start,
      end,
      length,
      type: 'sequence',
      strand: 1,
    }
  })
}

watch(
  inputBlobs,
  async (blobs) => {
    if (!blobs.length) {
      parsedInputs.value = []
      return
    }
    const results = await Promise.all(
      blobs.map(async (item) => {
        const text = await item.blob.text()
        const fileName = item.entry.name || item.entry.dataset_name || 'unknown.fasta'
        const sequences = parseFile(text, { fileName })
        const browserSequences = transformToBrowserSequences(sequences)
        return { entry: item.entry, sequences, browserSequences }
      }),
    )
    parsedInputs.value = results
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <h1 class="text-xl font-bold">
      results
    </h1>

    <div v-if="parsedInputs.length" class="mt-4">
      <h2 class="text-lg font-semibold">
        Inputs
      </h2>
      <UCard v-for="(item, i) in parsedInputs" :key="`input-${i}`" variant="outline" class="my-4">
        <template #title>
          <h3 class="font-semibold mb-2">
            {{ item.entry.name || item.entry.dataset_name }}
            ({{ item.sequences.length }} sequence{{ item.sequences.length > 1 ? 's' : '' }})
          </h3>
        </template>

        <UScrollArea class="h-96">
          <UCard v-for="(seq, j) in item.sequences" :key="`seq-${j}`" :title="seq.name" variant="subtle" class="m-2">
            <template #description>
              <p class="text-sm text-muted">
                {{ seq.seq.length }} bp | type : {{ seq.type }}
              </p>
            </template>
            <div class="space-y-1">
              <pre class="text-sm p-2 rounded overflow-x-auto">{{ seq.seq }}</pre>
            </div>
          </UCard>
        </UScrollArea>
      </UCard>
    </div>
    <div v-if="parsedOutputs.length" class="mt-4">
      <h2 class="text-lg font-semibold">
        Outputs
      </h2>
      <UCard v-for="(item, i) in parsedOutputs" :key="`output-${i}`" variant="outline" class="my-4">
        <template #title>
          <h3 class="font-semibold">
            {{ item.entry.name || item.entry.dataset_name }}
          </h3>
        </template>
        <UScrollArea class="h-64">
          <UCard variant="subtle" class="m-2">
            <pre class="text-sm p-2 rounded overflow-x-auto">{{ item.text }}</pre>
          </UCard>
        </UScrollArea>
      </UCard>
    </div>
  </div>
</template>
