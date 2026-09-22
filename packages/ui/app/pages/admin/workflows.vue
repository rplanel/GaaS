<script setup lang="ts">
// import type { SupabaseTypes } from '#build/types/database'
import type { BadgeProps, BreadcrumbItem, TableColumn } from '@nuxt/ui'

import type { GalaxyWorkflowsItem } from 'blendtype'
import type { Database } from 'nuxt-galaxy'
import type { ResultsViewReading } from '../../utils/resultsViews'
import { resultsViews } from '#build/gaas/results-views.mjs'
import { USwitch } from '#components'
import { getWorkflowTagName, getWorkflowTagVersion } from 'blendtype'
import { log } from 'evlog/client'
import { describeActivationFailure } from '../../utils/activationFailure'
import { matchResultsView, resultsViewReading } from '../../utils/resultsViews'
// type Database = SupabaseTypes.Database

interface ComputedGalaxyWorklowItem extends GalaxyWorkflowsItem {
  /** The `version:` tag value. */
  version: string
  /** The `name:` tag value. */
  tagName: string
  activated: boolean
  /** Whether a results view names this workflow, something wider stands in, or none does. */
  resultsView: ResultsViewReading
}
interface Props {
  breadcrumbsItems?: BreadcrumbItem[] | undefined
}
const props = withDefaults(defineProps<Props>(), {
  breadcrumbsItems: undefined,
})
const breadcrumbsItems = toRef(() => props.breadcrumbsItems)

const toast = useToast()
const UBadge = resolveComponent('UBadge')

/** The reading at a glance: a view of the workflow's own, something wider, or nothing. */
const resultsViewReadingColor = {
  exact: 'success',
  fallback: 'info',
  none: 'neutral',
} as const satisfies Record<ResultsViewReading, BadgeProps['color']>

const supabase = useSupabaseClient<Database>()
const {
  public: {
    galaxy: { url: galaxyInstanceUrl },
  },
} = useRuntimeConfig()

const router = useRouter()

const { userRole } = useUserRole(supabase)

const computedBreadcrumbsItems = computed(() => {
  const breadcrumbsItemsVal = toValue(breadcrumbsItems)
  if (breadcrumbsItemsVal) {
    return [
      ...breadcrumbsItemsVal.map(breadcrumb => ({
        ...breadcrumb,
        disabled: false,
      })),
      {
        label: 'Workflows',
        disabled: true,
        to: '/admin/workflows',
      },
    ]
  }
  return breadcrumbsItemsVal
})

const galaxyWorkflowGalaxyColumns = ref<
  TableColumn<ComputedGalaxyWorklowItem>[]
>([
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'version', header: 'Version' },
  {
    accessorKey: 'number_of_steps',
    header: 'Number of steps',
    cell: ({ row }) => {
      return h(UBadge, { class: 'capitalize', variant: 'subtle' }, () =>
        row.getValue('number_of_steps'))
    },
  },
  {
    accessorKey: 'create_time',
    header: 'Create time',
    cell: ({ row }) => {
      return new Date(row.getValue('create_time')).toLocaleString('en-US', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    },
  },

  {
    // Keyed by tag values, so it answers before activation too: a developer
    // sees here whether the view directory they wrote will be picked up
    // (ADR 0003). The same match the results page runs, so the two agree.
    accessorKey: 'resultsView',
    header: 'Results view',
    cell: ({ row }) => {
      const reading = row.original.resultsView
      return h(UBadge, {
        'data-testid': 'workflow-results-view',
        'variant': 'subtle',
        'color': resultsViewReadingColor[reading],
      }, () => reading)
    },
  },
  {
    header: 'Activated',
    cell: ({ row }) => {
      return h(USwitch, {
        class: 'text-right',
        modelValue: row.original.activated,
        disabled: row.original.activated,
        onChange() {
          addToDb({ id: row.original.id })
        },
      })
    },
  },
])

async function addToDb(workflow: { id: string }) {
  const { id: galaxyId } = workflow
  try {
    await $fetch('/api/db/workflows', {
      method: 'POST',
      body: {
        galaxyId,
      },
    })
    // only once the server has said yes: this used to fire from the switch
    // before the request was even sent, so a refusal still read as a success
    toast.add({
      title: 'Workflow activated',
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
    router.push('/workflows')
  }
  catch (error) {
    // a refusal names what to fix in Galaxy, so the administrator reads it
    // here, next to the switch, rather than on the error page; the cause
    // itself is only ever worth a log
    const { errorStatus } = useErrorStatus(error)
    log.error({
      action: 'workflow:activate_failed',
      tag: 'admin/workflows',
      status: toValue(errorStatus),
      error: String(error),
    })
    toast.add({
      ...describeActivationFailure(error),
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
  }
}

const { data: allWorkflows, error: errorWorkflows } = useQuery(() => galaxyWorkflowsListQuery())

if (toValue(errorWorkflows)) {
  const { errorStatus } = useErrorStatus(errorWorkflows)
  const { errorMessage } = useErrorMessage(errorWorkflows)
  throw createError({
    statusCode: toValue(errorStatus),
    statusMessage: toValue(errorMessage),
  })
}

// const { data: allWorkflows, error: errorWorklows } = await useFetch<
//   GalaxyWorkflowsItem[]
// >('/api/galaxy/workflows')
// if (toValue(errorWorklows)) {
//   const { errorStatus } = useErrorStatus(errorWorklows)
//   const { errorMessage } = useErrorMessage(errorWorklows)
//   throw createError({
//     statusCode: toValue(errorStatus),
//     statusMessage: toValue(errorMessage),
//   })
// }

const { data: galaxyInstance } = useQuery(() =>
  instanceByUrlQuery({
    supabase,
    instanceUrl: galaxyInstanceUrl,
  }),
)

const { data: dbWorkflows } = useQuery(() => {
  return workflowsListQuery({ supabase })
})

const dbWorkflowsMap = computed(() => {
  const dbWorkflowsVal = toValue(dbWorkflows)
  if (dbWorkflowsVal) {
    return new Map(
      dbWorkflowsVal.map(workflow => [workflow.galaxy_id, workflow]),
    )
  }
  return new Map()
})

const computedWorkflows = computed<ComputedGalaxyWorklowItem[]>(() => {
  const allWorkflowsVal = toValue(allWorkflows)

  if (!allWorkflowsVal) {
    return []
  }

  // Only a workflow carrying both tags can be activated or have a results
  // view, so the others are left out rather than shown with blanks.
  return (allWorkflowsVal as GalaxyWorkflowsItem[]).flatMap((workflow) => {
    const version = getWorkflowTagVersion(workflow.tags)
    const tagName = getWorkflowTagName(workflow.tags)
    if (version === null || tagName === null)
      return []
    const { rung } = matchResultsView(resultsViews, { name: tagName, version })
    return [{
      ...workflow,
      version,
      tagName,
      activated: dbWorkflowsMap.value.has(workflow.id),
      resultsView: resultsViewReading(rung),
    }]
  })
})

const pageHeaderProps = computed(() => {
  return {
    title: 'Workflows',
    description:
      'Manage the workflows that are available for this web application',
    headline: galaxyInstance.value?.name ?? 'Galaxy Instance',

  }
})
</script>

<template>
  <div v-if="userRole === 'admin'">
    <div v-if="galaxyInstance">
      <PageHeader :page-header-props icon="i-lucide:workflow" :breadcrumbs-items="computedBreadcrumbsItems" />
      <NuxtErrorBoundary>
        <UTable
          v-if="allWorkflows" sticky :data="computedWorkflows" :columns="galaxyWorkflowGalaxyColumns"
          class="flex-1 max-h-125"
        />
        <template #error="error">
          <pre>{{ error }}</pre>
        </template>
      </NuxtErrorBoundary>
    </div>
    <div v-else>
      <UAlert title="No Galaxy instance defined" />
    </div>
  </div>
</template>
