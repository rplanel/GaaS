import type { TagRow } from 'nuxt-galaxy'

export interface UseDatasetTagsOptions<TagsType extends string> {
  dataset: { tags: TagRow[], datasets: { dataset_name: string } }
  tagTypes: readonly TagsType[]
}

export function useDatasetTags<TagsType extends string>(options: UseDatasetTagsOptions<TagsType>) {
  const { dataset, tagTypes } = options
  // type TagsType = typeof tagTypes[number]

  const { tags } = toValue(dataset)
  const isTagType = (tag: string): tag is TagsType => {
    return tagTypes.includes(tag as TagsType)
  }

  const stringifyTags = computed<TagsType | null>(() => {
    const tagsVal = toValue(tags)
    const stringTag = tagsVal.map(t => t.label).sort().join('-')
    if (isTagType(stringTag)) {
      return stringTag
    }
    //
    return null
  })

  if (stringifyTags.value === null) {
    console.warn(`cannot handle this result file : ${toValue(dataset).datasets.dataset_name}`)
  }

  return {
    stringifyTags,
  }
}
