import { v4 as uuidv4 } from 'uuid'

/**
 * Composable for managing a list of facet filters
 * @template T - The type of the facet filter object to manage
 * @returns An object containing methods to add, remove, and update filters, as well as the current list of filters
 */
export function useFacetFilters<T extends object>() {
  const filters: Ref<Array<T & { uuid: string }> | undefined> = ref(undefined)

  /**
   * Adds a new filter to the list of managed filters.
   * @param filter
   */
  function addFilter(filter: T) {
    const filtersVal = toValue(filters)
    const uuid = uuidv4()
    const newFilter = { ...filter, uuid }
    if (!filtersVal) {
      filters.value = [newFilter]
    }
    else {
      filtersVal.push(newFilter)
    }
    return newFilter
  }

  /**
   * Removes a filter from the list based on its unique identifier.
   * @param uuid The unique identifier of the filter to remove
   */
  function removeFilter(uuid: string) {
    const filtersVal = toValue(filters)
    if (!filtersVal)
      return
    const index = filtersVal.findIndex(filter => filter.uuid === uuid)
    if (index !== -1) {
      filtersVal.splice(index, 1)
    }
  }

  /**
   * Updates an existing filter in the list based on its unique identifier.
   * @param uuid the unique identifier of the filter to update
   * @param updatedFilter Filter object containing the updated properties
   */
  function updateFilter(uuid: string, updatedFilter: Partial<T>) {
    const filtersVal = toValue(filters)
    if (!filtersVal)
      return
    const index = filtersVal.findIndex(filter => filter.uuid === uuid)
    if (index !== -1) {
      const filterToUpdate = filtersVal[index]
      if (filterToUpdate !== undefined) {
        filtersVal[index] = { ...filterToUpdate, ...updatedFilter }
      }
    }
  }

  function resetFilters() {
    filters.value = undefined
  }

  return { addFilter, removeFilter, updateFilter, resetFilters, filters }
}
