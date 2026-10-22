<script setup lang="ts">
import type { Database } from 'nuxt-galaxy'
import { format } from 'date-fns'
import { useDefinedBreakpoints } from '../../composables/useDefinedBreakpoints'

definePageMeta({
  name: 'analysis-detail',
})

const router = useRouter()
const route = useRoute('analysis-detail')
const supabase = useSupabaseClient<Database>()
const toast = useToast()
const analysisId = ref<number | undefined>(undefined)
const isOpen = ref(true)
const isSyncing = ref(false)
const { isSmallDesktopOrMobile } = useDefinedBreakpoints()

const analysisIdFromRoute = computed(() => {
  const analysisIdParam = route.params.analysisId
  return Number.parseInt(analysisIdParam as string)
})

const { data: analysis } = useQuery(
  () => analysisByIdWithOutputsAndWorkflowsQuery({ id: toValue(analysisIdFromRoute), supabase }),
)
const queryCache = useQueryCache()

watch(() => {
  if (route?.params && 'analysisId' in route.params) {
    const analysisIdParam = route.params.analysisId
    if (Array.isArray(analysisIdParam)) {
      return 0
    }
    if (analysisIdParam !== undefined) {
      return Number.parseInt(analysisIdParam as string)
    }
    return route.params.analysisId
  }
}, (newAnalysisId) => {
  if (newAnalysisId !== undefined) {
    analysisId.value = Number.parseInt(newAnalysisId as string)
  }
  else {
    analysisId.value = undefined
  }
}, { immediate: true, deep: true })

// Display-only refresh: these subscriptions re-fetch displayed rows and must not trigger Galaxy sync.
// The names are the history panel's, so the two share one channel per table (#170).
useSupabaseRealtime(`galaxy:histories:${toValue(analysisIdFromRoute)}`, 'histories', handleUpdates)
useSupabaseRealtime(`galaxy:jobs:${toValue(analysisIdFromRoute)}`, 'jobs', handleUpdates)
useSupabaseRealtime(`galaxy:analysis_outputs:${toValue(analysisIdFromRoute)}`, 'analysis_outputs', handleUpdates)

// Every cache entry under this analysis, not only this page's own: the results
// page below reads a dedicated entry of the same analysis (ADR 0003) and the
// view it renders can never query for itself, so a `refresh()` here, which
// reaches one entry, left the view with the outputs it was first handed until
// a focus change or a navigation (#58). Keys nest under `byId`, so the prefix
// takes in every entry, and only the active ones are refetched.
function handleUpdates() {
  queryCache.invalidateQueries({ key: SUPABASE_ANALYSES_QUERY_KEYS.byId(toValue(analysisIdFromRoute)) })
}

async function syncAnalysis() {
  isSyncing.value = true
  try {
    await $fetch(`/api/db/analyses/${analysisIdFromRoute.value}/sync`, { method: 'POST' })
    toast.add({
      title: 'Sync queued',
      description: 'The analysis sync has been queued.',
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
  }
  catch (error) {
    const { errorMessage } = useErrorMessage(error)
    toast.add({
      title: 'Sync failed',
      description: errorMessage.value || 'Sync request failed. Please try again or check the analysis status.',
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
  }
  finally {
    isSyncing.value = false
  }
}

function enterMotion(delay: number = 0) {
  return {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay },
  }
}
</script>

<template>
  <UDashboardPanel
    :id="`history-panel-${analysisIdFromRoute}`" class="overflow-auto" :min-size="60" :ui="{
      body: 'p-0 sm:p-0',
    }"
  >
    <template #header>
      <UDashboardNavbar v-if="analysis" :toggle="true">
        <template #leading>
          <UButton
            icon="i-lucide-x" color="neutral" variant="ghost" class="-ms-1.5"
            @click="router.push('/analyses')"
          />
        </template>
        <template #default>
          <UBadge color="neutral" variant="soft">
            {{ format(new Date(analysis.created_at), 'dd MMM HH:mm') }}
          </UBadge>
        </template>
        <template #right>
          <UTooltip text="Rename Analysis">
            <UButton color="neutral" variant="ghost" icon="i-lucide-pen" />
          </UTooltip>
          <UTooltip text="Sync now">
            <UButton color="primary" variant="ghost" icon="i-lucide:refresh-cw" :loading="isSyncing" @click="syncAnalysis" />
          </UTooltip>
          <UTooltip text="Run Again">
            <UButton color="neutral" variant="ghost" icon="i-lucide:refresh-ccw" />
          </UTooltip>
          <UTooltip text="Delete Analysis">
            <UButton color="error" variant="ghost" icon="i-lucide-trash" />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <USlideover v-if="isSmallDesktopOrMobile" v-model:open="isOpen">
        <template #content>
          <UPage>
            <UPageHeader
              :ui="{
                title: 'px-6 ',
                root: 'border-b-0',

              }"
            >
              <template #title>
                <Motion as="span" v-bind="enterMotion(0.2)">
                  {{ analysis?.name || 'Unnamed' }}
                </Motion>
              </template>
            </UPageHeader>
            <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')" />
            <NuxtPage />
          </UPage>
        </template>
      </USlideover>
      <template v-else>
        <UPage>
          <UPageHeader
            :ui="{
              title: 'px-6 ',
              root: 'border-b-0',
            }"
          >
            <template #title>
              <Motion as="span" v-bind="enterMotion(0.2)" class="inline-block">
                {{ analysis?.name || 'Unnamed' }}
              </Motion>
            </template>
          </UPageHeader>
          <UPageBody>
            <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')" />
            <NuxtPage />
          </UPageBody>
        </UPage>
      </template>
    </template>
  </UDashboardPanel>
</template>
