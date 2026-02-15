<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
// import type { Database } from '../../types'
import type { Database } from 'nuxt-galaxy'
import type { AnalysesListProvide } from '../../layouts/default.vue'
import type { ListAnalysisWithWorkflow, SanitizedAnalysis } from '../../pages/analyses/index.vue'

// interface Props {
//   collapsed?: boolean
// }

// const props = withDefaults(defineProps<Props>(), {
//   collapsed: false,
// })

// const collapsed = toRef(() => props.collapsed)
const collapsedModel = defineModel('collapsed', { default: false })
const supabase = useSupabaseClient<Database>()
const supabaseUser = useSupabaseUser()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const isEditingAnalyses = ref<Record<number, string>>({})
const actionButtonProps = ref<ButtonProps>({ size: 'xs', variant: 'ghost', color: 'neutral' })

const analysesListInjected = inject<AnalysesListProvide>('analysesList')
const { refreshAnalysesList } = analysesListInjected || {}
// let realtimeChannel: RealtimeChannel

const { data: analyses, refresh: refreshAnalyses } = await useAsyncData(
  'analyses',
  async () => {
    const supabaseUserVal = toValue(supabaseUser)

    if (supabaseUserVal === null) {
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
        state,
        workflows(*),
        histories(state, is_sync)
        `,
      )
      .order('id', { ascending: true })
      .overrideTypes<ListAnalysisWithWorkflow[]>()
    if (error) {
      throw createError({
        statusMessage: error.message,
        statusCode: Number.parseInt(error.code),
      })
    }
    return data || []
  },
)

useSupabaseRealtime('galaxy:analyses', 'analyses', refreshAnalyses)

const items = [
  [
    {
      label: 'Delete',
      color: 'error' as const,
      icon: 'i-lucide-trash',
      slot: 'delete',
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

const navigationAnalysis = computed(() => {
  const sanitizedAnalysesVal = toValue(sanitizedAnalyses)
  return sanitizedAnalysesVal?.map((analysis) => {
    return {
      ...analysis,
      to: `/analyses/${analysis.id}`,
      slot: 'analysis',
      description: `${analysis.workflows.name} - v${analysis.workflows.version}`,
      tooltip: {
        text: analysis.name,
      },
    }
  })
})

const analysisRefs = ref<Element[]>([])
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
    const index = navigationAnalysis.value.findIndex(analysis => analysis.id === analysisId.value)
    if (index === -1 || index === navigationAnalysis.value.length - 1) {
      const curr = navigationAnalysis.value[0]
      if (curr)
        router.push(`/analyses/${curr.id}`)
    }
    else if (index < navigationAnalysis.value.length - 1) {
      const curr = navigationAnalysis.value[index + 1]
      if (curr)
        router.push(`/analyses/${curr.id}`)
    }
  },
  arrowup: () => {
    const index = navigationAnalysis.value.findIndex(analysis => analysis.id === analysisId.value)
    if (index === -1 || index === 0) {
      const curr = navigationAnalysis.value[navigationAnalysis.value.length - 1]
      if (curr)
        router.push(`/analyses/${curr.id}`)
    }
    else if (index <= navigationAnalysis.value.length - 1) {
      const curr = navigationAnalysis.value[index - 1]
      if (curr)
        router.push(`/analyses/${curr.id}`)
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
  <div class="overflow-y-auto divide-y divide-default">
    <UNavigationMenu
      :collapsed="collapsedModel"
      :items="navigationAnalysis"
      orientation="vertical"
      label-key="name"

      :ui="{

      }"
    >
      <template #analysis-leading="{ item }">
        <GalaxyStatus :state="item.state" />
      </template>
      <template #analysis-label="{ item }">
        <div class="flex flex-col gap-1">
          <div
            v-if="isEditingAnalyses?.[item.id]"
            class="grid grid-flow-col-dense auto-cols-max gap-0.5 justify-start w-full"
          >
            <div class="self-center w-full flex-1">
              <UInput
                v-if="isEditingAnalyses?.[item.id]" v-model="isEditingAnalyses[item.id]"
                label="Analysis Name" class=""
              />
            </div>
            <div class="self-center flex-none">
              <UButton
                color="success" variant="ghost" size="sm" icon="i-lucide:check"
                @click="editAnalysisName(item.id)"
              />
            </div>
            <div class="self-center flex-none">
              <UButton
                color="warning" variant="ghost" size="sm" icon="i-mdi:cancel"
                @click="resetEditAnalysis(item.id)"
              />
            </div>
          </div>
          <div v-else class="font-medium text-highlighted text-base">
            {{ item.name }}
          </div>
          <div class="text-muted text-sm">
            {{ item.workflows.name }} <UBadge :label="item.workflows.version" size="sm" variant="subtle" color="neutral" />
          </div>
        </div>
      </template>

      <template #analysis-trailing="{ item }">
        <div>
          <UButton
            v-bind="actionButtonProps"
            icon="lucide:pen"
            @click.prevent="setEditState(item.id, item.name)"
          />

          <UButton
            v-bind="actionButtonProps"
            icon="lucide:refresh-ccw"
            @click.prevent="router.push(`/analyses/${item.id}/rerun`)"
          />
          <UButton
            v-bind="actionButtonProps"
            color="error"
          />
          <UDropdownMenu :items="items">
            <UButton v-bind="actionButtonProps" icon="tabler:dots-vertical" />

            <template #delete>
              <div @click="deleteItem(item)">
                <UIcon name="i-lucide-trash" />
                Delete
              </div>
            </template>
          </UDropdownMenu>
        </div>
      </template>
    </UNavigationMenu>

    <!-- <div
      v-for="(analysis, index) in sanitizedAnalyses" :key="index"
      :ref="el => { analysisRefs[analysis.id] = el as Element }"
    >
      <NuxtLink
        :to="`/analyses/${analysis.id}`"
      >
        <div
          class="p-4 sm:px-6 cursor-pointer border-l-2 transition-colors"
          :class="[analysisId && analysisId === analysis.id ? 'border-primary bg-primary/10' : 'border-(--ui-bg) hover:border-primary hover:bg-primary/5']"
        >
          <div class="flex flex-row items-center justify-between">
            <div class="flex flex-row justify-start gap-4 items-center">
              <div>
                <GalaxyStatus :state="analysis.state" />
              </div>

              <div class="flex flex-col">
                <div
                  v-if="isEditingAnalyses?.[analysis.id]"
                  class="grid grid-flow-col-dense auto-cols-max gap-0.5 justify-start w-full"
                >
                  <div class="self-center w-full flex-1">
                    <UInput
                      v-if="isEditingAnalyses?.[analysis.id]" v-model="isEditingAnalyses[analysis.id]"
                      label="Analysis Name" class=""
                    />
                  </div>
                  <div class="self-center flex-none">
                    <UButton
                      color="success" variant="ghost" size="sm" icon="i-lucide:check"
                      @click="editAnalysisName(analysis.id)"
                    />
                  </div>
                  <div class="self-center flex-none">
                    <UButton
                      color="warning" variant="ghost" size="sm" icon="i-mdi:cancel"
                      @click="resetEditAnalysis(analysis.id)"
                    />
                  </div>
                </div>
                <div v-else class="font-medium text-highlighted text-base">
                  {{ analysis.name }}
                </div>
                <div class="text-muted text-sm">
                  {{ analysis.workflows.name }} <UBadge :label="analysis.workflows.version" size="sm" variant="subtle" color="neutral" />
                </div>
              </div>
            </div>
            <div class="">
              <UButton
                v-bind="actionButtonProps"
                icon="lucide:pen"
                @click.prevent="setEditState(analysis.id, analysis.name)"
              />

              <UButton
                v-bind="actionButtonProps"
                icon="lucide:refresh-ccw"
                @click.prevent="router.push(`/analyses/${analysis.id}/rerun`)"
              />
              <UButton
                v-bind="actionButtonProps"
                color="error"
              />
              <UDropdownMenu :items="items">
                <UButton v-bind="actionButtonProps" icon="tabler:dots-vertical" />

                <template #delete>
                  <div @click="deleteItem(analysis)">
                    <UIcon name="i-lucide-trash" />
                    Delete
                  </div>
                </template>
              </UDropdownMenu>
            </div>
          </div>
        </div>
      </NuxtLink>
    </div> -->
  </div>
</template>
