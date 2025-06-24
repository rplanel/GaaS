<script setup lang="ts">
import { promiseTimeout, useTimeout } from '@vueuse/core'
import { useBibliography } from '../../composables/useBibliography'

interface Props {
  dois?: string[]
}
const props = withDefaults(defineProps<Props>(), {
  dois: () => ([]),
})
const router = useRouter()

const dois = toRef(() => props.dois)

const doisIdentifier = computed(() => {
  const doisVal = toValue(dois)
  if (doisVal) {
    return JSON.stringify(doisVal
      .map(doi => doi.trim())
      .sort())
  }
  return []
})
const selectedRef = useState<string | undefined>('selected-ref')

const { data: articles } = await useAsyncData(
  `biblio-${toValue(doisIdentifier)}`,
  () => {
    return queryCollection('bibliography')
      .where('DOI', 'IN', toValue(dois))
      .all()
  },
)
const { ready, start, stop } = useTimeout(1000, { controls: true })
const { bibliography } = useBibliography(articles)

const sortedBibliography = computed(() => {
  const bibliographyVal = toValue(bibliography)
  if (!bibliographyVal) {
    return []
  }
  return bibliographyVal.sort((a, b) => {
    if (a.year && b.year) {
      return b.year - a.year
    }
    return 0
  })
})

watch (selectedRef, (newSelectedRef) => {
  if (newSelectedRef) {
    start()
    router.push({ hash: `#${newSelectedRef}` })
    promiseTimeout(1000).then(() => {
      stop()
      selectedRef.value = undefined
    })
  }
})
</script>

<template>
  <div class="bibliography-section">
    <ProseH2 id="bibliography">
      Bibliography
    </ProseH2>
    <UPageList divide>
      <UPageCard
        v-for="(item) in sortedBibliography"
        :id="item.doi"
        :key="item.doi"
        :description="item.authors.join(', ')"
        variant="ghost"
        :ui="{ footer: 'pt-1 mt-auto w-full' }"
        :highlight="!ready && item.doi === selectedRef"
      >
        <template #title>
          <ULink
            :id="item.doi"
            :to="`https://doi.org/${item.doi}`"
            target="_blank"
            rel="noopener noreferrer"
            class="text-base text-pretty font-semibold text-highlighted hover:text-primary"
          >
            {{ item.title }}
          </ULink>
        </template>
        <template #footer>
          <div class="flex flex-col gap-1 w-full">
            <div class="text-sm flex flex-row justify-end gap-1">
              <UBadge v-if="item.journal" variant="soft" color="neutral" class="italic">
                <template #default>
                  <span v-html="item.journal" />
                </template>
              </UBadge>
              <UBadge v-if="item.year" variant="soft" color="info" class="font-semibold">
                {{ item.year }}
              </UBadge>
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
