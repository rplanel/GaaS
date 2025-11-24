import type { InputMenuItem } from '@nuxt/ui'
import type { Ref } from 'vue'
import type { FacetFilter } from '../../utils/filterSchema'

export type InputMenuItems = Array<InputMenuItem>

// Comparison operators (equality, inequality, and relational)
// export const comparaisonOperators = ['=', '!=', '>', '>=', '<', '<='] as const
// export type ComparisonOperator = typeof comparaisonOperators[number]

// Range operator
// export const rangeOperators = ['TO'] as const
// export type RangeOperator = typeof rangeOperators[number]

// Existence operators
// export const existenceOperators = ['EXISTS', 'IS EMPTY', 'IS NULL'] as const
// export type ExistenceOperator = typeof existenceOperators[number]

// Set operators
// export const setOperators = ['IN'] as const
// export type SetOperator = typeof setOperators[number]

// Negation operator
// export const negationOperators = ['NOT'] as const
// export type NegationOperator = typeof negationOperators[number]

// Logical operators (conjunction and disjunction)
// export const groupingOperators = ['AND', 'OR'] as const
// export type GroupingOperator = typeof groupingOperators[number]

// Combined type
// export type FacetOperators
//   = | ComparisonOperator
//     | RangeOperator
//     | ExistenceOperator
//     | SetOperator
// | NegationOperator
// | GroupingOperator

// export type SetValues = string[]
// export type RangeValues = [number | string | null, number | string | null]
// export type ComparisonValues = string | number

// export type FacetValues = SetValues | RangeValues | ComparisonValues

// interface BaseFacetFilter {
//   attribute: string
// }

// export interface SetFacetFilter extends BaseFacetFilter {
//   type: 'set'
//   operator: SetOperator
//   negation?: NegationOperator
//   values: SetValues
// }

// export interface ExistenceFacetFilter extends BaseFacetFilter {
//   type: 'existence'
//   operator: ExistenceOperator
//   negation?: NegationOperator
// }

// export interface RangeFacetFilter extends BaseFacetFilter {
//   type: 'range'
//   operator: RangeOperator
//   values: RangeValues
// }

// export interface ComparisonFacetFilter extends BaseFacetFilter {
//   type: 'comparison'
//   operator: ComparisonOperator
//   values: ComparisonValues
// }

// export type FacetFilter
//   = | ComparisonFacetFilter
//     | RangeFacetFilter
//     | ExistenceFacetFilter
//     | SetFacetFilter

// //
export type OrFacetFilterGroup = Array<FacetFilter>
export type AndFacetFilterGroup = Array<FacetFilter | OrFacetFilterGroup>

export interface UseFacetFilterOptions {
  meiliIndex: Ref<string>
}

export function useFacetFilter(
  // options: UseFacetFilterOptions
) {
  // const { meiliIndex } = options
  const filters = ref<string[]>([])
  // const slicedFacetFilters = shallowRef<Array<FacetFilter | FacetFilterGroup> | undefined>(undefined)
  const slicedFacetFilterEnd = shallowRef<number | undefined>(undefined)
  const facetFilters = shallowRef<AndFacetFilterGroup>([
  //   {
  //   type: 'comparison',
  //   attribute: 'genres',
  //   operator: '=',
  //   values: 'drama',
  // }, {
  //   type: 'range',
  //   attribute: 'price',
  //   operator: 'TO',
  //   values: ['0', '100'],
  // }
  ])
  const editingFacetFilter = ref<FacetFilter | undefined>(undefined)
  // const { searchForFacetValues, facetResult } = useFacetSearch({ meiliIndex })

  /**
   * Add a facet filter to the current filters
   * @param filter FacetFilter | FacetFilterGroup to add to the current filters
   */
  function addFilter(filter: FacetFilter | OrFacetFilterGroup) {
    const facetFiltersValue = facetFilters.value
    facetFilters.value = [...facetFiltersValue, filter]
  }

  /**
   * Remove a facet filter from the current filters
   * @param index Index of the facet filter to remove
   */
  function removeFilter(index: number) {
    const facetFiltersValue = facetFilters.value
    facetFiltersValue.splice(index, 1)
    facetFilters.value = [...facetFiltersValue]
  }

  /**
   * Get the sliced facet filters (up to the last focused one)
   * This is useful to avoid filtering on facets that are not yet selected
   * when searching for facet values
   */
  const slicedFacetFilters = computed(() => {
    const end = slicedFacetFilterEnd.value
    const facetFiltersValue = facetFilters.value
    if (end === undefined) {
      return facetFiltersValue
    }
    return facetFiltersValue.slice(0, end + 1)
  })

  function facetFilterToModel(facetFilter: FacetFilter): string {
    // comparaison facet filter
    if (facetFilter.type === 'comparison') {
      return `${facetFilter.attribute} ${facetFilter.operator} ${facetFilter.values}`
    }
    // Range facet filter
    if (facetFilter.type === 'range') {
      return `${facetFilter.attribute} ${facetFilter.values[0]} ${facetFilter.operator} ${facetFilter.values[1]}`
    }

    return 'Unsupported facet filter type'
  }

  function facetFiltersToInputMenuItems(facetFilters: AndFacetFilterGroup) {
    if (Array.isArray(facetFilters)) {
      return facetFilters.flatMap((facetFilter) => {
        if (Array.isArray(facetFilter)) {
          // OR group
          return facetFilter.flatMap(facetFilterToModel)
        }
        else {
          return facetFilterToModel(facetFilter)
        }
      })
    }
    return [{ label: 'Unsupported facet filter type' }]
  }

  // function isComparisonFilter(filter: Omit<FacetFilter, 'type'>) {
  //   const result = ComparisonFacetFilterSchema.safeParse({ ...filter, type: 'comparison' })
  //   if (!result.success)
  //     return false
  //   return true
  // }

  return {
    addFilter,
    removeFilter,
    filters,
    facetFilters,
    slicedFacetFilters,
    slicedFacetFilterEnd,
    editingFacetFilter,
    facetFilterToInputMenuItem: facetFilterToModel,
    facetFiltersToInputMenuItems,
  }
}
