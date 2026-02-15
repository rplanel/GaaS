import type { TagRow } from 'nuxt-galaxy'
import type { Ref } from 'vue'
import { computed, toValue } from 'vue'
import { useDatabaseTags } from './useDatabaseTags'

export interface UseDatasetTagsOptions<TagsType extends string> {
  dataset: Ref<{ tags: TagRow[], datasets: { dataset_name: string } }>
  tagTypes: readonly TagsType[]
}

export function useDatabaseDatasetTags<TagsType extends string>(options: UseDatasetTagsOptions<TagsType>) {
  const { dataset, tagTypes } = options
  // type TagsType = typeof tagTypes[number]

  const isTagType = (tag: string): tag is TagsType => {
    return tagTypes.includes(tag as TagsType)
  }

  const tags = computed(() => {
    return toValue(dataset).tags
  })

  const { stringifyTags } = useDatabaseTags({ tags })

  const isValidTag = computed(() => {
    const stringTag = toValue(stringifyTags)
    return stringTag !== null && isTagType(stringTag)
  })

  return {
    stringifyTags,
    isValidTag,
  }
}
