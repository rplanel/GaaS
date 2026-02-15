import type { Ref } from 'vue'
import type { TagRow } from '~/src/runtime/types/nuxt-galaxy'
import { computed, toValue } from 'vue'

export interface UseDatabaseTagsOptions {
  tags: Ref<TagRow[]>

}

export function useDatabaseTags(options: UseDatabaseTagsOptions) {
  const { tags } = options
  const stringifyTags = computed(() => {
    const tagsVal = toValue(tags)
    return tagsVal.map(t => t.label).sort().join('-')
  })

  return {
    stringifyTags,
  }
}
