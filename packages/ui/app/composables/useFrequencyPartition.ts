interface UseFrequencyPartitionOptions<T> {
  items: Ref<T[]>
  getId: (item: T) => string | number | undefined
  getFrequency: (item: T) => number
  frequencyThreshold?: number
  sizeThreshold?: number
  aggregateFn: (items: T[]) => T
}

export function useFrequencyPartition<T>(options: UseFrequencyPartitionOptions<T>) {
  const { items, getFrequency, frequencyThreshold = 0.02, sizeThreshold = 10, aggregateFn, getId } = options

  const itemIdPartition = computed(() => {
    const highFreqIds = new Set<string | number>()
    const lowFreqIds = new Set<string | number>()
    for (const item of toValue(items)) {
      if (highFreqIds.size < sizeThreshold) {
        highFreqIds.add(getId(item)!)
      }
      else {
        if (getFrequency(item) >= frequencyThreshold) {
          highFreqIds.add(getId(item)!)
        }
        else {
          lowFreqIds.add(getId(item)!)
        }
      }
    }
    return { toDisplay: highFreqIds, toGroup: lowFreqIds }
  })

  const displayedItemIds = computed(() => {
    return itemIdPartition.value.toDisplay
  })

  const aggregatedItemIds = computed(() => {
    return itemIdPartition.value.toGroup
  })

  const partitionedItems = computed(() => {
    const displayedItemIdsVal = toValue(displayedItemIds)
    const aggregatedItemIdsVal = toValue(aggregatedItemIds)
    const displayedItems: T[] = []
    const aggregatedItems: T[] = []

    for (const item of toValue(items)) {
      const id = getId(item)
      if (id !== undefined) {
        if (displayedItemIdsVal.has(id)) {
          displayedItems.push(item)
        }
        else if (aggregatedItemIdsVal.has(id)) {
          aggregatedItems.push(item)
        }
      }
    }

    return [
      ...displayedItems,
      aggregateFn(aggregatedItems),
    ]
  })

  const displayedItems = computed(() => {
    const displayedItemIdsVal = toValue(displayedItemIds)
    return toValue(items).filter((item) => {
      const id = getId(item)
      return id !== undefined && displayedItemIdsVal.has(id)
    })
  })

  const displayedItemCount = computed(() => {
    return displayedItems.value.reduce((sum, item) => sum + getFrequency(item), 0)
  })

  return {
    partitionedItems,
    displayedItems,
    displayedItemCount,
    displayedItemIds,
    aggregatedItemIds,
  }
}
