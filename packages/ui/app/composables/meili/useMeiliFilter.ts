import type { MaybeRefOrGetter } from 'vue'
import type { ComparisonValues, FacetFilter } from '../../utils/filterSchema'

/**
 * Converts a single FacetFilter to a Meilisearch filter string
 *
 * @param filter - The FacetFilter to convert
 * @returns The Meilisearch filter string
 */
function facetFilterToMeiliFilter(filter: FacetFilter | undefined): string {
  if (!filter) {
    return ''
  }
  const type = filter.type
  const attribute = filter.attribute
  const operator = filter.operator

  switch (type) {
    case 'set':
      return `${attribute} ${operator} [${((filter as any).values as string[]).map(v => `"${v}"`).join(', ')}]`
    case 'comparison':
    { const values = (filter as any).values as ComparisonValues
      return `${attribute} ${operator} "${values}"` }
    case 'range':
      return `${attribute} ${((filter as any).values)[0]} TO ${((filter as any).values)[1]}`
    case 'existence':
      return `${attribute} ${operator}`
    default:
      return ''
  }
}

/**
 * Composable that converts a list of FacetFilters to Meilisearch filter strings
 *
 * @param filters - The list of FacetFilters to convert (can be a ref, getter, or raw value)
 * @returns A computed property containing an array of Meilisearch filter strings
 *
 * @example
 * ```ts
 * const filters = ref<FacetFilter[]>([
 *   {
 *     type: 'comparison',
 *     attribute: 'age',
 *     operator: '>',
 *     values: 18
 *   },
 *   {
 *     type: 'set',
 *     attribute: 'category',
 *     operator: 'IN',
 *     values: ['fiction', 'science']
 *   }
 * ])
 * const { meiliFilters } = useMeiliFilter(filters)
 * // meiliFilters.value => ['age > "18"', 'category IN ["fiction", "science"]']
 * ```
 */
export function useMeiliFilter(filters: MaybeRefOrGetter<FacetFilter[] | undefined>) {
  const meiliFilters = computed(() => {
    const filtersValue = toValue(filters)
    if (!filtersValue) {
      return ''
    }
    return filtersValue.map(facetFilterToMeiliFilter)
  })

  return {
    facetFilterToMeiliFilter,
    meiliFilters,
  }
}
