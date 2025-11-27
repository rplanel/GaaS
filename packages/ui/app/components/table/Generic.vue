<script setup lang="ts" generic="T">
import type { TableProps } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/vue-table'

interface Props<T> {
  title?: string
  utableProps: TableProps<T>
}

defineProps<Props<T>>()

const table = useTemplateRef('table')
const filterInput = useTemplateRef('filterInput')
const pageSizeOptions = ref([5, 10, 15])
const pagination = ref({
  pageIndex: 0,
  pageSize: pageSizeOptions.value[0],
})
const globalFilter = ref('')
defineShortcuts({
  '/': () => {
    filterInput.value?.inputRef?.focus()
  },
})

function updatePageSize(pageSize: number) {
  const tableVal = toValue(table)
  tableVal?.tableApi.setPageSize(pageSize)
  pagination.value.pageIndex = 0
}
</script>

<template>
  <div>
    <h2 v-if="title" class="text-lg font-bold mb-2">
      {{ title }}
    </h2>
    <UPageCard variant="outline">
      <div class="w-full space-y-4 pb-4">
        <div class="flex p-3 w-full">
          <UInput
            ref="filterInput" v-model="globalFilter" size="lg" icon="lucide:filter" class="w-full"
            placeholder="Filter..."
          >
            <template #trailing>
              <template v-if="globalFilter?.length">
                <UButton
                  color="neutral" variant="link" icon="lucide:circle-x" aria-label="Clear input"
                  @click="globalFilter = ''"
                />
              </template>
              <template v-else>
                <UKbd value="/" />
              </template>
            </template>
          </UInput>
        </div>
        <UTable
          ref="table" v-model:pagination="pagination" v-model:global-filter="globalFilter" :pagination-options="{
            getPaginationRowModel: getPaginationRowModel(),
          }" v-bind="utableProps" class="flex-1"
        >
          <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
            <slot :name="slotName" v-bind="slotProps ?? {}" />
          </template>
        </UTable>
        <div class="flex justify-center px-4 gap-2">
          <UPagination
            :page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
            :items-per-page="table?.tableApi?.getState().pagination.pageSize"
            :total="table?.tableApi?.getFilteredRowModel().rows.length"
            @update:page="(p) => table?.tableApi?.setPageIndex(p - 1)"
          />
          <USelect
            :model-value="table?.tableApi?.getState().pagination.pageSize" :items="pageSizeOptions"
            variant="soft" @update:model-value="updatePageSize"
          />
        </div>
      </div>
    </UPageCard>
  </div>
</template>
