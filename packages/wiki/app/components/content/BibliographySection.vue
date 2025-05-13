<script setup lang="ts">
import { useBibliography } from '../../composables/useBibliography'

interface Props {
  dois?: string[]
}
const props = withDefaults(defineProps<Props>(), {
  dois: () => ([]),
})

const { dois } = toRefs(props)

const doisIdentifier = computed(() => {
  const doisVal = toValue(dois)
  if (doisVal) {
    return JSON.stringify(doisVal
      .map(doi => doi.trim())
      .sort())
  }
  return []
})

const { data: articles } = await useAsyncData(
  `biblio-${toValue(doisIdentifier)}`,
  () => {
    return queryCollection('bibliography')
      .where('DOI', 'IN', toValue(dois))
      .all()
  },
)

const { bibliography } = useBibliography(articles)
</script>

<template>
  <div class="bibliography-section">
    <ProseH2 id="bibliography">
      Bibliography
    </ProseH2>
    <UPageList divide>
      <UPageCard
        v-for="(item) in bibliography"
        :id="item.doi"
        :key="item.doi"
        :description="item.authors.join(', ')"
        variant="ghost"
        :ui="{ footer: 'pt-1 mt-auto w-full' }"
      >
        <template #title>
          <NuxtLink
            :to="`https://doi.org/${item.doi}`"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="text-base text-pretty font-semibold text-highlighted">
              {{ item.title }}
            </div>
          </NuxtLink>
        </template>
        <template #footer>
          <div class="flex flex-col gap-1 w-full">
            <div class="text-sm flex flex-row justify-end">
              <span v-if="item.year" class="font-semibold">{{ item.year }}</span>
              <span v-if="item.journal" class="italic" v-html="`&nbsp;-&nbsp;${item.journal}`" />
            </div>
            <div v-if="item.abstract" class="flex justify-start">
              <UCollapsible :ui="{ content: 'w-full' }" :unmount-on-hide="false">
                <UButton
                  label="Abstract"
                  color="neutral"
                  variant="ghost"
                  trailing-icon="i-lucide-chevron-down"
                  :ui="{
                    trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200',
                  }"
                />

                <template #content>
                  <div
                    class="flex w-full text-toned text-sm text-justify"
                  >
                    {{ item.abstract }}
                  </div>
                </template>
              </UCollapsible>
            </div>
          </div>
        </template>

        <!-- doi -->
        <!-- <span v-if="item.doi">
          <a :href="`https://doi.org/${item.doi}`" target="_blank" rel="noopener noreferrer">
            {{ item.doi }}
          </a>
        </span> -->
      </UPageCard>
    </UPageList>
  </div>
</template>
