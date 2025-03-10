<script setup lang="ts">
import type { SupabaseTypes } from '#build/types/database'
import type { CommandPaletteItem } from '@nuxt/ui'

type Database = SupabaseTypes.Database
type Analysis = Pick<
  Database['galaxy']['Tables']['analyses']['Row'],
  'id' | 'name' | 'state'
>
const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const value = ref({})
const router = useRouter()
const links = [{
  label: 'job',
  icon: 'i-lucide-book-open',
  to: '#job',
}]

const { data: analyses } = await useAsyncData(
  'analyses-aside',
  async () => {
    const userVal = toValue(user)

    if (userVal === null) {
      throw createError({
        statusMessage: 'User not found',
        statusCode: 404,
      })
    }

    const { data, error } = await supabase
      .schema('galaxy')
      .from('analyses')
      .select(
        `
        id,
        name,
        state
        `,
      )
      .order('id', { ascending: true })
      .returns<Analysis[]>()
    if (error) {
      throw createError({
        statusMessage: error.message,
        statusCode: Number.parseInt(error.code),
      })
    }
    if (data === null) {
      throw createError({ statusMessage: 'No analysis found', statusCode: 404 })
    }
    return data
  },
)

const groups = computed(() => {
  const analysesVal = toValue(analyses)
  let items: CommandPaletteItem[] = []
  if (analysesVal) {
    items = analysesVal.map((analysis) => {
      return { label: analysis.name, onSelect: () => router.push(`/analyses/${analysis.id}/results`) }
    })
  }
  return [{ id: 'analyses', label: 'Analyses', items }]
})
</script>

<template>
  <UContainer>
    <UPage>
      <template #left>
        <UPageAside>
          <UCommandPalette v-model="value" :groups="groups" :fuse="{ fuseOptions: { includeMatches: true } }" />
        </UPageAside>
      </template>
      <template #right>
        <UPageAside>
          <UPageAnchors :links="links" />
        </UPageAside>
      </template>
      <slot />
    </UPage>
  </UContainer>
</template>
