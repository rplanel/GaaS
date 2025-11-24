<script setup lang="ts">
import type { StepperItem } from '@nuxt/ui'
import type { FacetDistribution, FacetStats } from 'meilisearch'
import type { FacetFilter, FacetOperators, FacetValues, FilterType } from '../../utils/filterSchema'
import { ref } from 'vue'
import { useFacetFilter } from '../../composables/meili/useFacetFilter'
import {
  categoricalOperators,
  comparisonOperators,
  continuousOperators,
  existenceOperators,
  filterSchemas,
  rangeOperators,
  setOperators,
} from '../../utils/filterSchema'

type DataType = 'categorical' | 'continuous'

interface OperatorItem {
  label: string
  operator: FacetOperators
  negation?: boolean
  preferred: boolean
}

// PROPS
interface Props {
  meiliIndex: string // Define any props if needed
  facetDistribution: FacetDistribution | undefined
  facetStats: FacetStats | undefined
}
const props = defineProps<Props>()

// EMITS
// const emit = defineEmits<{ addFilter: [facetFilter: FacetFilter] }>()
const newFilter = ref<Partial<FacetFilter>>({})
const filterAttribute = ref<string>('')
const filterOperator = ref<FacetOperators | undefined>(undefined)
const filterValues = ref<FacetValues | undefined>(undefined)
const filterNegationOperator = ref<boolean | undefined>(undefined)

// Refs

const meiliIndex = toRef(() => props.meiliIndex)
const facetDistribution = toRef(() => props.facetDistribution)
const facetStats = toRef(() => props.facetStats)
const stepperActiveItem = ref<number>(0)
// const { searchForFacetValues, facetResult } = useFacetSearch({ meiliIndex })
const {
  addFilter,
  facetFilters,
  // removeFilter,
  // slicedFacetFilterEnd,
  // slicedFacetFilters,
  // facetFilterToInputMenuItem,
  // facetFiltersToInputMenuItems,
} = useFacetFilter({ meiliIndex })

// const inputsMenuItems = shallowRef<InputMenuItems>([])
const facetList = computed(() => {
  const facetDistributionVal = toValue(facetDistribution)
  // const facetStatsVal = toValue(facetStats)
  // console.log('facetDistributionVal', facetDistributionVal)
  // console.log('facetStatsVal', facetStatsVal)
  if (!facetDistributionVal) {
    return []
  }
  return Object.keys(facetDistributionVal).map(key => ({
    label: key,
    count: Object.keys(facetDistributionVal[key]).length,
  }))
})

// if the data contains numbers so the type is continuous
// if the data contains only strings, the type is categorical

const attributeType = computed<DataType | undefined>(() => {
  const facetStatsVal = toValue(facetStats)
  const attribute = filterAttribute.value
  if (!facetStatsVal || !attribute) {
    return undefined
  }
  const stats = facetStatsVal?.[attribute]
  if (stats) {
    return 'continuous'
  }
  else {
    return 'categorical'
  }
})

const computedFacetOperators = computed<OperatorItem[]>(() => {
  const negation = filterNegationOperator.value
  const attributeTypeVal = attributeType.value

  // if attribute type is categorical, remove range operators
  const preferredOperatorsSet = attributeTypeVal === 'categorical'
    ? new Set(categoricalOperators)
    : new Set(continuousOperators)

  const noNegationOperatorsList = [...comparisonOperators, ...rangeOperators].map((op) => {
    return {
      label: op,
      operator: op as FacetOperators,
      preferred: preferredOperatorsSet.has(op as any),
    }
  })
  const negationOperatorsList = [...existenceOperators, ...setOperators].map(op => ({
    label: op,
    operator: op as FacetOperators,
    negation: false,
    preferred: preferredOperatorsSet.has(op as any),
  }))

  if (negation) {
    return [...noNegationOperatorsList, ...negationOperatorsList.map((op) => {
      if (op.label.startsWith('IS')) {
        return {
          ...op,
          label: `IS NOT ${op.label.slice(3)}`,
          negation: true,
        }
      }
      return {
        ...op,
        label: `NOT ${op.label}`,
        negation: true,
      }
    })].sort((a, b) => a.preferred === b.preferred ? 0 : a.preferred ? -1 : 1)
  }
  else {
    return [...noNegationOperatorsList, ...negationOperatorsList].sort((a, b) => a.preferred === b.preferred ? 0 : a.preferred ? -1 : 1)
  }
})

const stepperItems = ref<StepperItem[]>([
  {
    title: 'Attribute',
    slot: 'attribute' as const,
    icon: 'i-lucide-house',
  },
  {
    title: 'Operator',
    slot: 'operator' as const,
    icon: 'i-lucide-truck',
  },
  {
    title: 'Values',
    slot: 'values' as const,
  },
])

function nextStep() {
  if (stepperActiveItem.value < stepperItems.value.length - 1) {
    stepperActiveItem.value += 1
  }
}

function setFilterAttribute(attribute: string) {
  filterAttribute.value = attribute
  nextStep()
}

function setFilterOperator(operatorItem: OperatorItem) {
  filterOperator.value = operatorItem.operator
  nextStep()
}

const filterType = computed<FilterType | undefined>(() => {
  const operator = filterOperator.value
  if (!operator) {
    return undefined
  }
  if (comparisonOperators.includes(operator as ComparisonOperator)) {
    return 'comparison'
  }
  if (setOperators.includes(operator as SetOperator)) {
    return 'set'
  }
  if (rangeOperators.includes(operator as RangeOperator)) {
    return 'range'
  }
  if (existenceOperators.includes(operator as ExistenceOperator)) {
    return 'existence'
  }
  return undefined
})

// watch(filterValues, (newVal) => {
//   // console.log('filterValues changed', newVal)
// })

function parseFilter(attribute: string, operator: FacetOperators, values: FacetValues): FacetFilter | undefined {
  const testedFilter: any = {
    attribute,
    operator,
    values,
  }
  const filter = filterSchemas.reduce((acc, schema) => {
    const type = schema.shape.type.value
    const hasNegation = schema.shape?.negation !== undefined
    if (hasNegation) {
      testedFilter.negation = filterNegationOperator.value
    }
    const result = schema.safeParse({ ...testedFilter, type })
    if (result.success) {
      return result.data
    }
    return acc
  }, undefined as FacetFilter | undefined)
  return filter
}
const validatedFilter = computed(() => {
  // console.log('validating filter', {
  //   attribute: filterAttribute.value,
  //   operator: filterOperator.value,
  //   values: filterValues.value,
  // })
  if (!filterAttribute.value || !filterOperator.value || filterValues.value === undefined) {
    return undefined
  }
  return parseFilter(filterAttribute.value, filterOperator.value, filterValues.value)
})

function checkAndAddFilter() {
  const validatedFilterVal = validatedFilter.value
  if (!validatedFilterVal) {
    console.warn('Cannot add filter: filter is not valid', {
      attribute: filterAttribute.value,
      operator: filterOperator.value,
      values: filterValues.value,
    })
    return
  }
  addFilter(validatedFilterVal)
}
</script>

<template>
  <div>
    <div class="grid grid-cols-3 justify-center-safe gap-2">
      <div>Meili index:  {{ meiliIndex || 'N/A' }}</div>
      <div>filter type: {{ filterType || 'N/A' }}</div>
      <div>valid filter: {{ validatedFilter || 'N/A' }}</div>
      <div>all filters = {{ facetFilters || 'N/A' }}</div>
      <div>attribute type: {{ attributeType || 'N/A' }}</div>
      <div> values: {{ filterValues || 'N/A' }}</div>
      <div>
        <pre>{{ newFilter }}</pre>
      </div>
    </div>

    <div class="flex justify-start my-10">
      <UStepper v-model="stepperActiveItem" :items="stepperItems" orientation="vertical">
        <!-- Attribute -->
        <template #attribute="{ item }">
          <UCard variant="soft" lass="max-w-4xl">
            <template #header>
              Here you can select the {{ item.title }}: {{ meiliIndex }}
            </template>
            <UPageGrid>
              <UPageCard v-for="facet in facetList" :key="facet.label" variant="ghost" @click="setFilterAttribute(facet.label)">
                {{ facet.label }} ({{ facet.count }})
              </UPageCard>
            </UPageGrid>
          </UCard>
        </template>
        <!-- Operator -->
        <template #operator="{ item }">
          <UCard variant="soft" class="max-w-4xl">
            <template #header>
              Here you can select the {{ item.title }} : {{ meiliIndex }}
            </template>
            <div class="flex flex-col gap-2">
              <div>
                <USwitch v-model="filterNegationOperator" label="NOT" />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2">
                <UButton
                  v-for="operator in computedFacetOperators"
                  :key="operator.operator"
                  variant="subtle"
                  :color="operator.preferred ? 'success' : 'warning'"
                  @click="setFilterOperator(operator) "
                >
                  {{ operator.label }}
                </UButton>
              </div>
            </div>
          </UCard>
        </template>

        <!-- Values -->
        <template #values="{ item }">
          <UCard variant="soft" lass="max-w-4xl">
            <template #header>
              Here you can select the {{ item.title }} : {{ meiliIndex }}
            </template>
            <div>
              <MeiliFilterInputSet
                v-if="filterType === 'set'"
                :meili-index="meiliIndex"
                :filter-attribute="filterAttribute"
                :filter-operator="filterOperator"
                :facet-distribution="facetDistribution"
              />

              <MeiliFilterInputRange
                v-else-if="filterType === 'range'"
                :meili-index="meiliIndex"
                :filter-attribute="filterAttribute"
                :filter-operator="filterOperator"
                :facet-stats="facetStats"
              />
              <UInputMenu v-else placeholder="single list" class="w-full" />
              <UButton @click="checkAndAddFilter">
                Add
              </UButton>
            </div>
          </UCard>
        </template>
      </UStepper>
    </div>
    <div class="flex flex-col-2 gap-1">
      <div>
        facetDistribution
        <!-- <pre>{{ facetDistribution }}</pre> -->
      </div>
      <div>
        <!-- <UFormField label="Facet Filter" hint="OR relation between values">
          <UInputMenu
            v-model="facetSearch"
            multiple
            variant="subtle"
            placeholder="Search facets..."
            class="w-full"
          />
        </UFormField> -->

        <!-- <div v-for="(_, index) in inputsMenuItems" :key="index" class="w-full">
          <UFormField label="Facet Filter" hint="OR relation between values">
            <div class="flex flex-row gap-1">
              <UInputMenu
                v-model="inputsMenuItems[index]"
                class="ml-4 w-full"
                variant="subtle"
                multiple
                @focus="editFacetFilter(index)"
              />
              <UButton @click="removeFilter(index)">
                Remove
              </UButton>
            </div>
          </UFormField>
          <div>
            <USeparator label="AND" class="my-2" />
          </div>
        </div> -->

        <!-- <UButton
          @click="addFilter([{
            attribute: 'test', values: facetFilters.length, operator: '=',
          }])"
        >
          AND
        </UButton> -->
        <!-- focus : {{ slicedFacetFilterEnd }} -->
        <!-- <div class="my-2 pa-2">
          <h5>Inputs Menu Items</h5>
          <div>{{ inputsMenuItems }}</div>
        </div>
        <div class="my-2 pa-2">
          <h5>Sliced Facet Filters</h5>
          <div>{{ slicedFacetFilters }}</div>
        </div>

        <div class="my-2 pa-2">
          <h5>Facet Filters</h5>
          <div>{{ facetFilters }}</div>
        </div>

        <div class="my-2 pa-2">
          <h5>Facet Search Results</h5>
          <div>{{ facetResult }}</div>
        </div> -->
      </div>
    </div>
    <!-- <USelect v-model="selectedFacet" :options="availableFacets.map(f => ({ label: f.value, value: f.value }))" multiple /> -->
  </div>
</template>
