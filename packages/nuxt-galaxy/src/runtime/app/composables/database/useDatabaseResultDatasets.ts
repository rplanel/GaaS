import type { DatasetRow, TagRow } from 'nuxt-galaxy'
import type { Ref } from 'vue'
import { computed, toValue } from 'vue'

interface DatasetWithTags {
  tags: TagRow[] | undefined
  datasets: DatasetRow
}

export interface UseDatabaseResultDatasetsOptions<TagsType extends string> {
  // datasets: Ref<Array<{ tags: TagRow[] | undefined, datasets: { dataset_name: string } }>> | undefined
  datasets: Ref<Array<DatasetWithTags>> | undefined
  tagTypes: readonly TagsType[]
}

export function useDatabaseResultDatasets<TagsType extends string>(options: UseDatabaseResultDatasetsOptions<TagsType>) {
  const { datasets, tagTypes } = options

  /**
   * Type guard function to check if a tag string is a valid TagsType.
   *
   * When this function returns true, TypeScript will narrow the type of the tag
   * parameter from `string` to `TagsType`, providing type safety in subsequent code.
   *
   * @param tag - The tag string to validate
   * @returns A type predicate indicating whether the tag is a valid TagsType defined in tagTypes array
   *
   * @example
   * const tag = "some-string"
   * if (isTagType(tag)) {
   *   // tag is now typed as TagsType instead of string
   * }
   */
  const isTagType = (tag: string): tag is TagsType => {
    return tagTypes.includes(tag as TagsType)
  }

  const stringifyTags = (tags: TagRow[]) => {
    return tags.map(({ label }) => label).sort().join('-')
  }

  /**
   * Computes a mapping of dataset names to their corresponding stringified tags.
   * This computed property iterates over the datasets, extracts their tags, and uses the stringifyTags function to convert the tags into a single string.
   * It only includes datasets that have valid tags according to the isTagType type guard.
   * @returns A record mapping dataset names to their stringified tags, or undefined if there are no datasets or tags.
   *
   */
  const resultDatasetTags = computed(() => {
    const datasetsVal = toValue(datasets)
    if (!datasetsVal)
      return undefined
    return toValue(datasetsVal).reduce((acc, { datasets, tags }) => {
      if (!tags)
        return acc
      const stringifyTag = stringifyTags(tags)
      if (!isTagType(stringifyTag))
        return acc
      acc[datasets.dataset_name] = stringifyTag

      return acc
    }, {} as Record<string, string>)
  })

  const resultOutputs = computed(() => {
    const datasetsVal = toValue(datasets)
    if (!datasetsVal)
      return []
    return toValue(datasetsVal).filter(({ datasets: { dataset_name: datasetName } }) => {
      return resultDatasetTags.value?.[datasetName] !== undefined
    })
  })

  return {
    stringifyTags,
    resultOutputs,
    resultDatasetTags,
    isTagType,
  }
}
