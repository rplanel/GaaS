interface UseGroupLowFrequencyOptions<T> {
  items: Ref<T[]>
  getId: (item: T) => string | number | undefined
  getFrequency: (item: T) => number
  threshold: number
  aggregateFn: (items: T[]) => T
}

export function useGroupLowFrequency<T>(options: UseGroupLowFrequencyOptions<T>) {
  const { items, getFrequency, threshold, aggregateFn, getId } = options

  const highFrequencyItemIds = computed(() => {
    const ids = new Set<string | number>()
    for (const item of toValue(items)) {
      if (getFrequency(item) >= threshold) {
        const id = getId(item)
        if (id !== undefined) {
          ids.add(id)
        }
      }
    }
    return ids
  })

  const lowFrequencyItemIds = computed(() => {
    const ids = new Set<string | number>()
    for (const item of toValue(items)) {
      if (getFrequency(item) < threshold) {
        const id = getId(item)
        if (id !== undefined) {
          ids.add(id)
        }
      }
    }
    return ids
  })

  const groupedItems = computed(() => {
    const highFrequencyItems: T[] = []
    const lowFrequencyItems: T[] = []

    for (const item of toValue(items)) {
      const id = getId(item)
      if (id !== undefined) {
        if (highFrequencyItemIds.value.has(id)) {
          highFrequencyItems.push(item)
        }
        else if (lowFrequencyItemIds.value.has(id)) {
          lowFrequencyItems.push(item)
        }
      }
    }

    if (lowFrequencyItems.length > 0) {
      return [
        ...highFrequencyItems,
        aggregateFn(lowFrequencyItems),
      ]
    }

    return highFrequencyItems
  })

  return {
    groupedItems,
    highFrequencyItemIds,
    lowFrequencyItemIds,
  }
}
