import type { InputMenuItem } from '@nuxt/ui'
import type { FacetDistribution, FacetStats } from 'meilisearch'
import type { ZodError } from 'zod'
import type { FacetFilter } from '../../utils/filterSchema'
import { operatorsWithNegation, operatorsWithoutNegation } from '../../utils/filterSchema'

export interface UseFacetFilterOptions {
  facetDistribution: Ref<FacetDistribution | undefined>
  facetStats: Ref<FacetStats | undefined>
  addFilter: (filter: FacetFilter) => void

}

type DataType = 'categorical' | 'continuous'

interface OperatorItem {
  label: string
  operator: FacetOperators
  negation?: boolean
  preferred: boolean
}

/**
 * composable for building Meili facet filters
 * for a meili index and from user input
 *
 * @returns
 */
export function useFacetFilterBuilder(options: UseFacetFilterOptions) {
  const { facetDistribution, facetStats, addFilter } = options
  const filterNegationOperator = ref<boolean | undefined>(undefined)
  const state = reactive<Partial<FacetFilter>>({
    type: undefined,
    attribute: undefined,
    operator: undefined,
    values: undefined,
    negation: undefined,
  })

  // Filter validation
  const isFilterValid = ref(false)

  const filterError = ref<ZodError | undefined>(undefined)
  watch(state, (newState) => {
    const filterType = newState.type
    if (!filterType) {
      isFilterValid.value = false
      return
    }
    const result = FacetFilterSchema.safeParse(newState)
    if (!result.success) {
      isFilterValid.value = false
      filterError.value = result.error
    }
    else {
      filterError.value = undefined
      isFilterValid.value = true
    }
  })

  /**
   * Validate and add the current filter state to the filters list.
   * It will wrap addFilter function provide as arguments of the composable with validation and state reset
   */
  function validateAndAddFilter() {
    if (isFilterValid.value) {
      addFilter({ ...state } as FacetFilterIdentified)
      // reset state
      state.attribute = undefined
      state.operator = undefined
      state.values = undefined
      state.type = undefined
      state.negation = undefined
      filterNegationOperator.value = undefined
    }
  }

  /**
   * List of facets available in the index
   * @returns array of facet names with their count
   *
   */
  const facetList = computed(() => {
    const facetDistributionVal = toValue(facetDistribution)
    if (!facetDistributionVal)
      return []

    return Object.entries(facetDistributionVal).map(([facetName, categoryDistribution]) => {
      return {
        label: facetName,
        count: categoryDistribution.length,
      }
    })
  })

  const facetOptions = computed<InputMenuItem[]>(() => {
    return facetList.value.map(({ label }) => {
      return {
        id: label,
        label,
        type: 'item',
      }
    })
  })

  /**
   * Determine the data type of the selected attribute
   * based on the facet stats available from Meili
   * @returns 'categorical' | 'continuous' | undefined
   */
  const attributeType = computed<DataType | undefined>(() => {
    const facetStatsVal = toValue(facetStats)
    const attribute = state.attribute
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

  const preferredOperatorsSet = computed<Set<string>>(() => {
    const attributeTypeVal = attributeType.value
    return attributeTypeVal === 'categorical'
      ? new Set(categoricalOperators)
      : new Set(continuousOperators)
  })

  const operatorsWithoutNegationItems = computed<OperatorItem[]>(() => {
    const preferredOperatorsSetVal = preferredOperatorsSet.value
    return operatorsWithoutNegation
      .filter(op => preferredOperatorsSetVal.has(op as any))
      .map((op) => {
        return {
          label: op,
          operator: op as FacetOperators,
          preferred: preferredOperatorsSetVal.has(op as any),
        }
      })
  })

  const operatorsWithNegationItems = computed<OperatorItem[]>(() => {
    const preferredOperatorsSetVal = preferredOperatorsSet.value
    return operatorsWithNegation
      .filter(op => preferredOperatorsSetVal.has(op as any))
      .map((op) => {
        return {
          label: op,
          operator: op as FacetOperators,
          preferred: preferredOperatorsSetVal.has(op as any),
        }
      })
  })

  /**
   * List of operators available based on the selected attribute type
   * and negation option
   */

  const facetOperators = computed<OperatorItem[]>(() => {
    const negation = filterNegationOperator.value
    const operatorsWithoutNegationItemsVal = operatorsWithoutNegationItems.value
    const operatorsWithNegationItemsVal = operatorsWithNegationItems.value

    if (negation) {
      return [...operatorsWithoutNegationItemsVal, ...operatorsWithNegationItemsVal.map((op) => {
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
      return [...operatorsWithoutNegationItemsVal, ...operatorsWithNegationItemsVal].sort((a, b) => a.preferred === b.preferred ? 0 : a.preferred ? -1 : 1)
    }
  })

  const filterType = computed<FilterType | undefined>(() => {
    const operator = state.operator
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

  const initialFilterValues = computed(() => {
    const type = toValue(filterType)
    const attributeTypeVal = toValue(attributeType)
    if (type === 'set') {
      return []
    }
    if (type === 'existence') {
      return undefined
    }
    if (type === 'comparison') {
      if (attributeTypeVal === 'categorical') {
        return ''
      }
      if (attributeTypeVal === 'continuous') {
        return 0
      }
    }
  })

  // initialize values when filter type changes
  watch(filterType, (newType) => {
    state.type = newType
    state.values = initialFilterValues.value
  })

  return {
    state,
    facetList,
    facetOptions,
    attributeType,
    facetOperators,
    filterType,
    validateAndAddFilter,
    filterError,
    isFilterValid,

  }
}
