<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
// import type { Database } from '../../types'
import type { Database } from 'nuxt-galaxy'
import type { AnalysesListProvide } from '../../layouts/default.vue'
import type { SanitizedAnalysis } from '../../pages/analyses/index.vue'
import { useRoute } from 'vue-router'

// const collapsedModel = defineModel('collapsed', { default: false })
const supabase = useSupabaseClient<Database>()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const isEditingAnalyses = ref<Record<number, string>>({})
const actionButtonProps = ref<ButtonProps>({ size: 'xs', variant: 'ghost', color: 'neutral' })

const analysesListInjected = inject<AnalysesListProvide>('analysesList')
const { refreshAnalysesList } = analysesListInjected || {}
// let realtimeChannel: RealtimeChannel

const { data: analyses, refresh: refreshAnalyses } = useQuery(
  () => analysesListWithWorkflowAndHistoryQuery({ supabase }),
)

useSupabaseRealtime('galaxy:analyses', 'analyses', refreshAnalyses)

const items = [
  [
    {
      label: 'Rename',
      icon: 'i-lucide-pen',
      slot: 'rename',
    },
    {
      label: 'Run again',
      icon: 'i-lucide:refresh-ccw',
      slot: 'rerun',
    },
  ],
  [
    {
      label: 'Delete',
      color: 'error',
      slot: 'delete',
      icon: 'i-lucide-trash',
    },
  ],
]

const analysisId = computed(() => {
  // debugger
  if (route?.params && 'analysisId' in route.params) {
    const analysisId = route.params.analysisId
    if (Array.isArray(analysisId))
      return 0
    return Number.parseInt(analysisId)
  }
  return undefined
})

function setEditState(id: number, name: string) {
  const isEditingAnalysesVal = toValue(isEditingAnalyses)
  isEditingAnalysesVal[id] = name
}

function resetEditAnalysis(id: number) {
  const isEditingAnalysesVal = toValue(isEditingAnalyses)
  if (isEditingAnalysesVal?.[id]) {
    const { [id]: toRemove, ...rest } = isEditingAnalysesVal
    isEditingAnalyses.value = rest
  }
}

const sanitizedAnalyses = computed<SanitizedAnalysis[]>(() => {
  const analysesVal = toValue(analyses)
  if (analysesVal && Array.isArray(analysesVal)) {
    return analysesVal?.map((a) => {
      const { id, name, state, is_sync } = a
      return {
        id,
        name,
        state,
        is_sync,
        workflows: {
          name: a.workflows.name,
          version: a.workflows.version_key,
          name_key: a.workflows.name_key,
        },
      }
    })
  }
  return []
})

const analysisRefs = ref<Record<number, Element | null>>({})
watch(analysisId, () => {
  const analysisIdVal = toValue(analysisId)
  if (!analysisIdVal) {
    return
  }
  const ref = analysisRefs.value[analysisIdVal]
  if (ref) {
    ref.scrollIntoView({ block: 'nearest' })
  }
  // debugger
})

defineShortcuts({
  arrowdown: () => {
    const index = sanitizedAnalyses.value.findIndex(analysis => analysis.id === analysisId.value)
    if (index === -1 || index === sanitizedAnalyses.value.length - 1) {
      const curr = sanitizedAnalyses.value[0]
      if (curr)
        router.push(`/analyses/${curr.id}/results`)
    }
    else if (index < sanitizedAnalyses.value.length - 1) {
      const curr = sanitizedAnalyses.value[index + 1]
      if (curr)
        router.push(`/analyses/${curr.id}/results`)
    }
  },
  arrowup: () => {
    const index = sanitizedAnalyses.value.findIndex(analysis => analysis.id === analysisId.value)
    if (index === -1 || index === 0) {
      const curr = sanitizedAnalyses.value[sanitizedAnalyses.value.length - 1]
      if (curr)
        router.push(`/analyses/${curr.id}/results`)
    }
    else if (index <= sanitizedAnalyses.value.length - 1) {
      const curr = sanitizedAnalyses.value[index - 1]
      if (curr)
        router.push(`/analyses/${curr.id}/results`)
    }
  },
})

async function deleteItem(item: SanitizedAnalysis) {
  try {
    await $fetch(`/api/db/analyses/${item.id}`, { method: 'DELETE' })
    refreshAnalyses()
    if (!refreshAnalysesList) {
      throw createError('refreshAnalysesList not provided')
    }
    refreshAnalysesList()
    toast.add({
      title: 'Analysis Deleted',
      description: 'The analysis has been deleted.',
    })
  }
  catch (error) {
    const { errorMessage } = useErrorMessage(error)
    const { errorStatus } = useErrorStatus(error)

    throw createError({
      message: toValue(errorMessage),
      statusCode: toValue(errorStatus),
    })
  }
}

async function editAnalysisName(id: number) {
  const isEditingAnalysesVal = toValue(isEditingAnalyses)
  if (isEditingAnalysesVal?.[id]) {
    const name = isEditingAnalysesVal[id]
    const { error } = await supabase
      .schema('galaxy')
      .from('analyses')
      .update({ name })
      .eq('id', id)
      .select()
    if (error) {
      const { errorMessage } = useErrorMessage(error)
      const { errorStatus } = useErrorStatus(error)
      throw createError({
        statusCode: toValue(errorStatus),
        statusMessage: toValue(errorMessage),
      })
    }
    const { [id]: toRemove, ...rest } = isEditingAnalyses.value
    isEditingAnalyses.value = rest
    refreshAnalyses()
  }
}
</script>

<template>
  <div class="overflow-y-auto divide-y divide-default overflow-x-auto">
    <div
      v-for="analysis in sanitizedAnalyses"
      :key="analysis.id"
      :ref="(el) => { analysisRefs[analysis.id] = el as Element | null }"
    >
      <NuxtLink
        :to="`/analyses/${analysis.id}/results`"
      >
        <div
          class="flex flex-col cursor-pointer border-l-2 transition-colors p-4 sm:px-6"
          :class="[
            analysisId === analysis.id
              ? 'border-primary bg-primary/10'
              : 'border-bg hover:border-primary hover:bg-primary/5',
          ]"
        >
          <!-- row 1 -->
          <div class="flex items-start gap-2 justify-between">
            <!-- Left side: Status icon + content -->
            <div class="flex item-center gap-2 truncate">
              <!-- status icon -->
              <div>
                <UTooltip :text="analysis.name">
                  <GalaxyStatus :state="analysis.state" />
                </UTooltip>
              <!-- Content (hidden when collapsed) -->
              <!-- Editing mode -->
              </div>
              <!-- item title -->
              <div class="truncate">
                <template v-if="isEditingAnalyses?.[analysis.id]">
                  <UInput
                    v-model="isEditingAnalyses[analysis.id]"
                    size="sm"
                    class="flex-1"
                  />
                  <UButton
                    color="success"
                    variant="ghost"
                    size="sm"
                    icon="i-lucide:check"
                    @click.prevent="editAnalysisName(analysis.id)"
                  />
                  <UButton
                    color="warning"
                    variant="ghost"
                    size="sm"
                    icon="i-mdi:cancel"
                    @click.prevent="resetEditAnalysis(analysis.id)"
                  />
                </template>
                <!-- Normal mode -->
                <template v-else>
                  <div class="text-md font-medium text-highlighted truncate">
                    {{ analysis.name }}
                  </div>
                </template>
              </div>
            </div>
            <!-- Right side: Action dropdown -->
            <div>
              <UDropdownMenu :items="items">
                <UButton v-bind="actionButtonProps" icon="tabler:dots-vertical" />
                <template #delete-label>
                  <div @click.prevent="deleteItem(analysis)">
                    Delete
                  </div>
                </template>
                <template #rename-label>
                  <div @click.prevent="setEditState(analysis.id, analysis.name)">
                    Rename
                  </div>
                </template>
                <template #rerun-label>
                  <div @click.prevent="router.push(`/analyses/${analysis.id}/rerun`)">
                    Run again
                  </div>
                </template>
              </UDropdownMenu>
            </div>
          </div>
          <!-- row 2  -->
          <div class="text-muted text-sm truncate">
            {{ analysis.workflows.name }}
            <UBadge :label="analysis.workflows.version" size="sm" variant="subtle" color="neutral" />
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
