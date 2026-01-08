<script lang="ts" generic="T">
</script>

<script lang="ts" setup generic="T">
import type { TableProps, TabsItem } from '@nuxt/ui'

import type { SortingState, Table } from '@tanstack/table-core'
import type { FacetDistribution, FacetStats, Filter } from 'meilisearch'
import { useFacetFilters } from '#layers/@gaas-ui/app/composables/meili/useFacetFilters'
import { refThrottled } from '@vueuse/core'
import { v4 as uuidv4 } from 'uuid'
import { useLoadMore } from '../../../composables/meili/useLoadMore'

export interface DataTableProps<T> {
  meiliIndex: string
  pageSize?: number
  tableProps: TableProps<T>
  filterBuild?: 'assisted' | 'advanced' | 'simple'
  sortingState: SortingState | undefined
  meiliFilters?: string[] | undefined
  debug?: boolean
}

const props = withDefaults(defineProps<DataTableProps<T>>(), {
  pageSize: 10,
  filterBuild: 'simple',
  debug: false,
})

const tableElem = useTemplateRef<{ tableApi: Table<T> }>('tableElem')
const debug = toRef(props, 'debug')
const sortingState = toRef(props.sortingState)
const tableProps = toRef(() => props.tableProps)
const meiliIndex = toRef(() => props.meiliIndex)
const meiliFiltersProp = toRef(() => props.meiliFilters)
const pageSize = toRef(props.pageSize)
const globalSearch = ref('')

// -- filters --
// model that store the filters added by the different filter builders
const modelFilters = defineModel<Record<string, FacetFilter | undefined>>('filters')
const manualFilter = ref<{ label: string | undefined, uuid: string }>({ label: undefined, uuid: uuidv4() })
const filterBuild = toRef(props.filterBuild)

// composable that manage the facet filters
const {
  filters: builderFilters,
  addFilter: addBuildFilter,
  removeFilter: removeBuildFilter,
} = useFacetFilters<FacetFilter>()

function toMeiliFilter(filter: FacetFilter): string {
  const attribute = filter.attribute
  const operator = filter.operator
  const values = filter.values
  switch (operator) {
    case 'NOT IN':
    case 'IN':
      return `${attribute} ${operator} [${(values as string[]).map(v => `"${v}"`).join(', ')}]`
    case '>':
    case '>=':
    case '<':
    case '<=':
    case '=':
    case '!=':
      return `${attribute} ${operator} "${values as ComparisonValues}"`
    case 'TO':
      return `${attribute} ${values[0]} TO ${values[1]}`
    case 'EXISTS':
    case 'NOT EXISTS':
    case 'IS EMPTY':
    case 'IS NOT EMPTY':
    case 'IS NULL':
    case 'IS NOT NULL':
      return `${attribute} ${operator}`
    default:
      return ''
  }
}
const modelFiltersList = computed<FacetFilter[] | undefined>(() => {
  const filtersVal = toValue(modelFilters)
  return filtersVal ? Object.values(filtersVal).map(f => f).filter((f): f is FacetFilter => f !== undefined) : undefined
})
const mergedFilters = computed(() => {
  const manual = toValue(manualFilter)
  const builder = toValue(builderFilters)
  const modelFiltersVal = toValue(modelFiltersList)
  const filters: { label: string, manual: boolean, uuid: string, type: 'build' | 'model' | 'manual' }[] = []
  if (Array.isArray(builder) && builder.length > 0) {
    filters.push(...builder.map((f, index) => {
      return {
        ...f,
        label: toMeiliFilter(f),
        manual: false,
        type: 'build' as const,
      }
    }))
  }

  if (Array.isArray(modelFiltersVal) && modelFiltersVal.length > 0) {
    filters.push(...modelFiltersVal.map((f, index) => {
      return {
        ...f,
        label: toMeiliFilter(f),
        uuid: uuidv4(),
        manual: false,
        type: 'model' as const,
      }
    }))
  }

  if (manual && manual.label && manual.label.length > 0) {
    filters.push({
      label: manual.label,
      manual: true,
      uuid: manual.uuid,
      type: 'manual' as const,
    })
  }

  return filters.length > 0 ? filters : undefined
})

const meiliFilters = computed<Filter | undefined>(() => {
  const merged = toValue(mergedFilters)
    ?.filter(f => f !== undefined)
    .map(f => f.label) ?? []
  const meiliFiltersPropVal = toValue(meiliFiltersProp)
    ?.filter(f => f !== undefined) ?? []

  return [...merged, ...meiliFiltersPropVal]
})
const throttledMeiliFilters = refThrottled(meiliFilters, 300)

function clearModelFilters(filter: FacetFilter) {
  const modelFiltersVal = toValue(modelFilters)
  if (!modelFiltersVal) {
    return
  }
  modelFiltersVal[filter.attribute as string] = undefined
}

// -- search for results --
const {
  initialTotalHits,
  totalHits,
  currentPage,
  currentPageSize,
  pageCount,
  isFirstPage,
  isLastPage,
  prev,
  next,
  result,
  error,
} = useLoadMore({
  meiliIndex,
  pageSize,
  filter: throttledMeiliFilters,
  searchTerm: globalSearch,
  sortingState,
})

// -- document ids --
// const documentIds = defineModel<string[] | undefined>('documentIds')
// const {
//   result: allIdsResult,
//   numberOfDocuments: numberOfDocumentsAllIds,
//   indexPrimaryKey,
// } = useAllIds({
//   meiliIndex,
//   filter: throttledMeiliFilters,
//   searchTerm: globalSearch,
// })

// const sanitizedDocumentIds = computed(() => {
//   const resultVal = toValue(allIdsResult)
//   if (!resultVal || !resultVal.hits) {
//     return []
//   }
//   return (resultVal.hits as any[]).map(hit => hit[indexPrimaryKey.value as string] as string)
// })

watch(
  () => props.pageSize,
  (value) => {
    pageSize.value = value
  },
)

const filterBuildOptions: TabsItem[] = [
  { label: 'Simple', slot: 'simple', value: 'simple' },
  { label: 'Advanced', slot: 'advanced', value: 'advanced' },
  // { label: 'Assisted', slot: 'assisted', value: 'assisted' },
]

// facet distribution
const initialFacetDistribution = ref<FacetDistribution | undefined>(undefined)
const facetDistribution = computed(() => {
  const resultVal = toValue(result)
  if (!resultVal || !resultVal.facetDistribution) {
    return undefined
  }
  return resultVal.facetDistribution
})

watch(facetDistribution, (newVal, oldVal) => {
  if (oldVal === undefined && newVal !== undefined) {
    initialFacetDistribution.value = newVal
  }
}, { once: true })

// facet stats
const initialFacetStats = ref<FacetStats | undefined>(undefined)
const facetStats = computed(() => {
  const resultVal = toValue(result)
  if (!resultVal || !resultVal.facetStats) {
    return undefined
  }
  return resultVal.facetStats
})
watch(facetStats, (newVal, oldVal) => {
  if (oldVal === undefined && newVal !== undefined) {
    initialFacetStats.value = newVal
  }
}, { once: true })

// processing time
const processingTimeMs = computed(() => {
  const resultVal = toValue(result)
  if (!resultVal) {
    return undefined
  }
  return resultVal.processingTimeMs
})

const computedTableProps = computed(() => {
  const resultVal = toValue(result)
  const tablePropsVal = toValue(tableProps)
  if (!resultVal || !tablePropsVal) {
    return tablePropsVal
  }
  return {
    ...tablePropsVal,
    data: resultVal.hits as T[],
  }
})

// watch(sanitizedDocumentIds, () => {
//   documentIds.value = toValue(sanitizedDocumentIds)
// })

// -- slot props --
const facetSlotProps = computed(() => {
  return {
    facetStats: facetStats.value,
    facetDistribution: facetDistribution.value,
    totalHits: totalHits.value,
    initialFacetStats: initialFacetStats.value,
    initialFacetDistribution: initialFacetDistribution.value,
    addFilter: addBuildFilter,
    removeFilter: removeBuildFilter,
    filters: builderFilters,

  }
})
</script>

<template>
  <div>
    <UCard>
      <template #header>
        <div class="flex flex-row justify-between">
          <div>
            <slot name="header" />
          </div>
          <div class="flex flex-col gap-1">
            <div class="flex flex-row justify-center">
              <UProgress v-model="totalHits" :max="initialTotalHits" size="xl" color="secondary" />
            </div>
            <div class="flex flex-row gap-2">
              <div class="text-xs">
                {{ totalHits }} / {{ initialTotalHits }} hits
              </div>
              <div class="flex self-end-safe ">
                <UBadge v-if="processingTimeMs !== undefined" color="neutral" variant="soft" size="sm">
                  Processing in {{ processingTimeMs }} ms
                </UBadge>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div v-if="debug">
        <MeiliIndexInfo :index-name="meiliIndex" />
        <UCard class="p-4 mb-4">
          <UAccordion
            :items="[{
              id: 'all-ids-info',
              label: 'All Ids Info',
            // data: sanitizedDocumentIds
            }]"
          >
            <template #body="{ item }">
              <!-- <pre>{{ numberOfDocumentsAllIds }}</pre> -->
              <!-- <pre>{{ allIdsResult?.estimatedTotalHits }} </pre> -->
              <pre>{{ item.data }}</pre>
            </template>
          </UAccordion>
        </UCard>
        <UCard class="p-4 mb-4">
          <UAccordion :items="[{ id: 'results-info', label: 'Results Info', data: result }]">
            <template #body="{ item }">
              <pre>{{ item.data }}</pre>
            </template>
          </UAccordion>
        </UCard>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex flex-row gap-4 items-end justify-between mt-4">
          <div class="flex flex-col grow gap-1">
            <MeiliSearchInput v-model="globalSearch" :meili-index="meiliIndex" />
          </div>
          <UModal title="Modal without overlay">
            <UButton label="Filter..." color="neutral" />

            <template #body>
              <slot name="filter-builder" :filters="builderFilters" :add-filter="addBuildFilter" :remove-filter="removeBuildFilter">
                <UTabs
                  v-model="filterBuild" :items="filterBuildOptions" variant="link"
                  class="mb-4 gap-4"
                >
                  <template #advanced>
                    <MeiliIndexFilterAdvancedBuilder
                      v-model:filter="manualFilter" v-model:search-error="error"
                      :meili-index="meiliIndex"
                    />
                  </template>
                  <template #simple>
                    <MeiliIndexFilterSimpleBuilder
                      :meili-index="meiliIndex"
                      :facet-distribution="facetDistribution"
                      :facet-stats="facetStats"
                      :add-filter="addBuildFilter"
                    />
                  </template>

                  <template #assisted>
                    <MeiliIndexFilterAssistedBuilder
                      :meili-index="meiliIndex" :facet-distribution="facetDistribution"
                      :facet-stats="facetStats"
                    />
                  </template>
                </UTabs>
              </slot>
            </template>
          </UModal>
        </div>
        <div class="flex flex-col gap-2">
          <div v-if="meiliFilters && meiliFilters.length > 0" class="flex flex-row items-center gap-2 ">
            <div>
              Filters:
            </div>
            <UBadge v-for="filter in mergedFilters" :key="filter.uuid" :label="`${filter.label}`" variant="subtle">
              <template #trailing>
                <UButton
                  icon="lucide:x" size="sm" variant="ghost"
                  @click="filter.type === 'model' ? clearModelFilters(filter) : filter.type === 'manual' ? manualFilter.label = undefined : removeBuildFilter(filter.uuid)"
                />
              </template>
            </UBadge>
          </div>
        </div>

        <div class="flex items-end justify-end">
          <TableColumnVisibility :table-elem="tableElem" />
        </div>
        <UTable v-bind="computedTableProps" ref="tableElem" v-model:sorting="sortingState" class="flex-1">
          <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
            <slot
              v-if="slotName.endsWith('-header')" :name="slotName" v-bind="{ ...slotProps || {}, ...facetSlotProps }"
            />
          </template>
        </UTable>
        <MeiliIndexDataTableNav
          v-model:page-size="pageSize" :total-hits="totalHits" :current-page="currentPage"
          :current-page-size="currentPageSize" :page-count="pageCount" :is-first-page="isFirstPage"
          :is-last-page="isLastPage" :prev="prev" :next="next"
        />
      </div>
    </UCard>
  </div>
</template>
