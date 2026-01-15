<script lang="ts" generic="T">
</script>

<script lang="ts" setup generic="T">
import type { TableProps, TabsItem } from '@nuxt/ui'

import type { SortingState, Table } from '@tanstack/table-core'
import type { FacetDistribution, FacetStats, Filter } from 'meilisearch'
import { useFacetFilters } from '#layers/@gaas-ui/app/composables/meili/useFacetFilters'
import { useMeiliFilter } from '#layers/@gaas-ui/app/composables/meili/useMeiliFilter'
import { useMeiliIndex } from '#layers/@gaas-ui/app/composables/meili/useMeiliIndex'
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
  title?: string
}

const props = withDefaults(defineProps<DataTableProps<T>>(), {
  pageSize: 10,
  filterBuild: 'simple',
  debug: false,
})

const tableElem = useTemplateRef<{ tableApi: Table<T> }>('tableElem')
const debug = toRef(props, 'debug')
const title = toRef(props, 'title')
const sortingState = toRef(props.sortingState)
const tableProps = toRef(() => props.tableProps)
const meiliIndex = toRef(() => props.meiliIndex)
const meiliFiltersProp = toRef(() => props.meiliFilters)
const pageSize = toRef(props.pageSize)
const globalSearch = ref('')

// -- filters --
// model that store the filters added by the different filter builders
// const modelFilters = defineModel<Record<string, FacetFilter | undefined>>('filters')
const manualFilter = ref<{ label: string | undefined, uuid: string }>({ label: undefined, uuid: uuidv4() })
const filterBuild = toRef(props.filterBuild)

// index information
const { stats: indexStats, settings: indexSettings } = useMeiliIndex({
  index: meiliIndex,
})

const numberOfDocuments = computed(() => {
  return indexStats.value?.state?.numberOfDocuments ?? 0
})

const maxValuesPerFacet = computed(() => {
  const indexSettingsValue = toValue(indexSettings)
  if (!indexSettingsValue) {
    return undefined
  }
  return indexSettingsValue.state?.faceting?.maxValuesPerFacet ?? undefined
})
// composable that manage the facet filters
const {
  filters: builderFilters,
  addFilter: addBuildFilter,
  removeFilter: removeBuildFilter,
  resetFilters: resetBuildFilters,
} = useFacetFilters<FacetFilter>()

const { meiliFilters: builderMeiliFilters } = useMeiliFilter(builderFilters)

// function toMeiliFilter(filter: FacetFilter): string {
//   const attribute = filter.attribute
//   const operator = filter.operator
//   const values = filter.values
//   switch (operator) {
//     case 'NOT IN':
//     case 'IN':
//       return `${attribute} ${operator} [${(values as string[]).map(v => `"${v}"`).join(', ')}]`
//     case '>':
//     case '>=':
//     case '<':
//     case '<=':
//     case '=':
//     case '!=':
//       return `${attribute} ${operator} "${values as ComparisonValues}"`
//     case 'TO':
//       return `${attribute} ${values[0]} TO ${values[1]}`
//     case 'EXISTS':
//     case 'NOT EXISTS':
//     case 'IS EMPTY':
//     case 'IS NOT EMPTY':
//     case 'IS NULL':
//     case 'IS NOT NULL':
//       return `${attribute} ${operator}`
//     default:
//       return ''
//   }
// }

const mergedFilters = computed(() => {
  const manual = toValue(manualFilter)
  const builder = toValue(builderFilters)
  const builderMeiliFiltersVal = toValue(builderMeiliFilters)
  // const modelFiltersVal = toValue(modelFiltersList)
  const filters: { label: string, manual: boolean, uuid: string, type: 'build' | 'model' | 'manual' }[] = []
  if (Array.isArray(builderMeiliFiltersVal) && builderMeiliFiltersVal.length > 0 && builder) {
    filters.push(
      ...builderMeiliFiltersVal
        .map((f, index) => {
          const builderItem = builder[index] as FacetFilter & { uuid: string }
          return {
            uuid: builderItem.uuid,
            label: f,
            manual: false,
            type: 'build' as const,
          }
        })
        .filter(f => f.uuid !== undefined),
    )
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

// -- search for results --
const {
  totalHits,
  currentPage,
  currentPageSize,
  pageCount,
  searchParams,
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
    numberOfDocuments: numberOfDocuments.value,
    initialFacetStats: initialFacetStats.value,
    initialFacetDistribution: initialFacetDistribution.value,
    addFilter: addBuildFilter,
    removeFilter: removeBuildFilter,
    filters: builderFilters,
    maxValuesPerFacet: maxValuesPerFacet.value,
    searchParams: searchParams.value,
    table: tableElem.value?.tableApi,

  }
})
</script>

<template>
  <div>
    <UCard>
      <template #header>
        <div class="flex flex-row justify-between">
          <div>
            <slot name="header">
              <span class="text-lg font-medium">{{ title }}</span>
            </slot>
          </div>
          <div class="flex flex-col gap-1">
            <!-- <div class="flex flex-row justify-center">
              <UProgress v-model="totalHits" :max="numberOfDocuments" size="xl" color="secondary" />
            </div> -->
            <div class="flex flex-row gap-2">
              <!-- <div class="text-xs">
                {{ totalHits }} / {{ numberOfDocuments }} hits
              </div> -->
              <div class="flex self-end-safe " />
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
        </div>
        <div class="flex flex-col gap-1">
          <div v-if="meiliFilters && meiliFilters.length > 0" class="flex flex-row items-center gap-1">
            <div>
              <UButton
                label="Reset"
                variant="subtle"
                size="sm"
                icon="i-lucide:trash"
                color="neutral"
                @click="resetBuildFilters"
              />
            </div>
            <div>
              <UModal title="Build a filter">
                <div class="flex items-center">
                  <UButton
                    label="Filter"
                    icon="i-lucide:filter"
                    variant="subtle"
                    size="sm"
                    color="neutral"
                  />
                </div>

                <template #body>
                  <slot
                    name="filter-builder"
                    :meili-index="meiliIndex"
                    v-bind="facetSlotProps"
                  >
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
                          v-bind="facetSlotProps"
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
            <USeparator v-if="mergedFilters && mergedFilters.length > 0" orientation="vertical" class="mx-2 h-8" />

            <div class="flex flex-row gap-2">
              <UBadge
                v-for="filter in mergedFilters"
                :key="filter.uuid"
                variant="soft"
              >
                <template #trailing>
                  <UButton
                    icon="lucide:x" size="xs" variant="ghost"
                    class="p-1"
                    @click="filter.type === 'manual' ? manualFilter.label = undefined : removeBuildFilter(filter.uuid)"
                  />
                </template>
                {{ filter.label }}
              </UBadge>
            </div>
          </div>
        </div>

        <div class="flex flex-row justify-between">
          <span
            v-if="processingTimeMs !== undefined"
            class="text-xs text-dimmed"
          >
            Processing in {{ processingTimeMs }} ms
          </span>
          <div>
            <TableColumnVisibility :table-elem="tableElem" />
          </div>
        </div>
        <UTable v-bind="computedTableProps" ref="tableElem" v-model:sorting="sortingState" class="flex-1 table-fixed">
          <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
            <slot
              v-if="slotName.endsWith('-header')" :name="slotName" v-bind="{ ...slotProps || {}, ...facetSlotProps }"
            />
          </template>
        </UTable>
        <MeiliIndexDataTableNav
          v-model:page-size="pageSize" :total-hits="numberOfDocuments" :current-page="currentPage"
          :current-page-size="currentPageSize" :page-count="pageCount" :is-first-page="isFirstPage"
          :is-last-page="isLastPage" :prev="prev" :next="next"
        />
      </div>
    </UCard>
  </div>
</template>
