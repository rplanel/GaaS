<script setup lang="ts">
export interface DataTableNavProps {
  totalHits?: number
  currentPage?: number
  currentPageSize?: number
  pageCount?: number
  isFirstPage?: boolean
  isLastPage?: boolean
  prev: () => void
  next: () => void
  // pageSize?: number
}

const props = withDefaults(defineProps<DataTableNavProps>(), {
  totalHits: 0,
  currentPage: 1,
  currentPageSize: 10,
  pageCount: 1,
  isFirstPage: true,
  isLastPage: true,
  pageSize: 10,
})

const pageSize = defineModel<number>('page-size')
const totalHits = toRef(() => props.totalHits)
const currentPageSize = toRef(() => props.currentPageSize)
const pageCount = toRef(() => props.pageCount)
const isFirstPage = toRef(() => props.isFirstPage)
const isLastPage = toRef(() => props.isLastPage)
const pageSizeItems = computed(() => [10, 25, 50].map(value => ({
  label: `${value} / page`,
  value,
})))
const { prev, next, currentPage } = toRefs(props)

const pageSizeModel = computed({
  get: () => pageSize.value,
  set: (value: number | null) => {
    const nextValue = typeof value === 'number' ? value : pageSize.value
    pageSize.value = nextValue
    currentPage.value = 1
  },
})

const pageSummary = computed(() => {
  const total = totalHits.value
  if (!total) {
    return {
      from: 0,
      to: 0,
    }
  }
  const from = (currentPage.value - 1) * currentPageSize.value + 1
  const to = Math.min(total, currentPage.value * currentPageSize.value)
  return { from, to }
})
</script>

<template>
  <div class="mt-4 flex flex-col gap-4 border-t border-gray-200 pt-4 md:flex-row md:items-center md:justify-between dark:border-gray-800">
    <div class="flex flex-col gap-1 text-sm text-muted md:flex-row md:items-center md:gap-3">
      <span>
        Showing {{ pageSummary.from }} - {{ pageSummary.to }} of {{ totalHits }} results
      </span>
      <span>
        Page {{ currentPage }} of {{ pageCount }} ({{ currentPageSize }} per page)
      </span>
    </div>
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
      <div class="flex items-center gap-2">
        <span class="text-sm text-muted">Rows per page</span>
        <USelect
          v-model="pageSizeModel"
          :items="pageSizeItems"
          variant="soft"
          class="w-28"
        />
      </div>
      <div class="flex items-center gap-2 md:ms-2">
        <UButton
          icon="i-lucide-chevron-left"
          variant="soft"
          size="sm"
          :disabled="isFirstPage"
          @click="prev"
        >
          Previous
        </UButton>
        <UButton
          icon-right="i-lucide-chevron-right"
          variant="soft"
          size="sm"
          :disabled="isLastPage"
          @click="next"
        >
          Next
        </UButton>
      </div>
    </div>
  </div>
</template>
