<script setup lang="ts">
import { computed, toValue } from 'vue'
import { useCitations } from '../../composables/useCitations'

export interface Props {
  dois?: string | undefined
}

const props = withDefaults(defineProps<Props>(), { dois: undefined })
const selectedRef = useState<string | undefined>('selected-ref', () => undefined)
const dois = toRef(() => props.dois)
const doisList = computed(() => {
  const doisVal = toValue(dois)
  if (doisVal) {
    return doisVal
      .split(',')
      .map(doi => doi.trim())
      .filter(doi => doi !== '' && doi)
  }
  return []
})

const { data: articles } = await useAsyncData(`biblio-${toValue(dois)}`, () => {
  return queryCollection('bibliography')
    .where('DOI', 'IN', toValue(doisList))
    .all()
})

function goToRef(doi: string) {
  selectedRef.value = doi
}
const sanitizedArticles = computed(() => {
  const articlesVal = toValue(articles)
  if (!articlesVal) {
    return []
  }
  // remove duplicates
  const seenDois = new Set<string>()
  return articlesVal.filter(article => !seenDois.has(article.DOI) && seenDois.add(article.DOI))
})
const { citations } = useCitations(sanitizedArticles)
</script>

<template>
  (
  <template v-if="articles && articles.length > 0">
    <template v-for="article, i in articles" :key="article.DOI">
      <ULink @click="goToRef(article.DOI)">
        <template v-if="citations && citations[i]">
          {{ citations[i].label }}
        </template>
        <template v-else>
          {{ article.title }}
        </template>
      </ULink>
      <span v-if="i !== doisList.length - 1">, </span>
    </template>
  </template>
  <template v-else>
    No ref
  </template>
  )
</template>
