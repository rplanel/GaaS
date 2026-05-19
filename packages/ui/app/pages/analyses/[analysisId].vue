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
const analysisId = ref<number | undefined>(undefined)
const isOpen = ref(true)
const { isSmallDesktopOrMobile } = useDefinedBreakpoints()

const analysisIdFromRoute = computed(() => {
  const analysisIdParam = route.params.analysisId
  return Number.parseInt(analysisIdParam as string)
})

const { data: analysis, refresh: refreshAnalysis } = useQuery(
  () => analysisByIdWithOutputsAndWorkflowsQuery({ id: toValue(analysisIdFromRoute), supabase }),
)

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

useSupabaseRealtime(`histories:${toValue(analysisIdFromRoute)}`, 'histories', handleUpdates)
useSupabaseRealtime(`jobs:${toValue(analysisIdFromRoute)}`, 'jobs', handleUpdates)
useSupabaseRealtime(`analysis_outputs:${toValue(analysisIdFromRoute)}`, 'analysis_outputs', handleUpdates)

function handleUpdates() {
  refreshAnalysis()
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
