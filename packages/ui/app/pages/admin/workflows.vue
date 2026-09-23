<script setup lang="ts">
// import type { SupabaseTypes } from '#build/types/database'
import type { BadgeProps, BreadcrumbItem, TableColumn } from '@nuxt/ui'

import type { GalaxyWorkflowsItem } from 'blendtype'
import type { Database, WorkflowRow } from 'nuxt-galaxy'
import type { ResultsViewKey, ResultsViewReading } from '../../utils/resultsViews'
import { resultsViews } from '#build/gaas/results-views.mjs'
import { USwitch } from '#components'
import { getWorkflowTagName, getWorkflowTagVersion } from 'blendtype'
import { log } from 'evlog/client'
import { describeActivationFailure } from '../../utils/activationFailure'
import { matchResultsView, resultsViewReading } from '../../utils/resultsViews'
// type Database = SupabaseTypes.Database

interface ComputedGalaxyWorklowItem extends GalaxyWorkflowsItem {
  /** The `version:` tag value, as Galaxy carries it now. */
  version: string
  /** The `name:` tag value, as Galaxy carries it now. */
  tagName: string
  activated: boolean
  /**
   * Whether a results view names this workflow, something wider stands in, or
   * none does. Read from the keys stored at activation once there are any,
   * from the live tags before.
   */
  resultsView: ResultsViewReading
  /**
   * Set when the workflow was retagged in Galaxy after activation: the keys
   * activation stored, which every analysis of it is matched with, beside
   * the tags Galaxy carries now, which no analysis will ever be matched with.
   */
  retagged?: { stored: ResultsViewKey, live: ResultsViewKey }
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
  // The live tag, even once activation has stored another: this column says
  // what Galaxy carries, and the Results view cell says when the two differ.
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
    // The same match the results page runs, handed the same keys, so the two
    // agree (ADR 0003). Once activated, those are the `name_key` and
    // `version_key` stored then, which every analysis is matched with even
    // after the workflow is retagged in Galaxy; before activation there are
    // none, so the live tags stand in and a developer sees here whether the
    // view directory they wrote will be picked up. A row whose tags moved says
    // so, naming both values, since the reading otherwise looks wrong.
    accessorKey: 'resultsView',
    header: 'Results view',
    cell: ({ row }) => {
      const { resultsView: reading, retagged } = row.original
      const badge = h(UBadge, {
        'data-testid': 'workflow-results-view',
        'variant': 'subtle',
        'color': resultsViewReadingColor[reading],
      }, () => reading)
      if (!retagged)
        return badge
      return h('div', { class: 'flex flex-col items-start gap-1' }, [
        badge,
        h('p', { 'data-testid': 'workflow-tag-drift', 'class': 'text-xs text-warning' }, describeRetag(retagged)),
      ])
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

/** The activated workflows by Galaxy id, each carrying the keys activation stored. */
const dbWorkflowsMap = computed(() => {
  const dbWorkflowsVal = toValue(dbWorkflows)
  if (dbWorkflowsVal) {
    return new Map<string, WorkflowRow>(
      dbWorkflowsVal.map(workflow => [workflow.galaxy_id, workflow]),
    )
  }
  return new Map<string, WorkflowRow>()
})

/**
 * The one line an administrator reads on a retagged row: what activation
 * stored, then what Galaxy carries now, each as `name/version`, so a
 * developer can see which directory the analyses are matched against.
 */
function describeRetag({ stored, live }: NonNullable<ComputedGalaxyWorklowItem['retagged']>) {
  return `Activated as ${stored.name}/${stored.version}; Galaxy now tags it ${live.name}/${live.version}.`
}

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
    const live: ResultsViewKey = { name: tagName, version }
    // Activation stores the tag values once and nothing updates them, so an
    // analysis is matched with the stored keys whatever Galaxy tags now.
    const stored = dbWorkflowsMap.value.get(workflow.id)
    const key: ResultsViewKey = stored ? { name: stored.name_key, version: stored.version_key } : live
    const { rung } = matchResultsView(resultsViews, key)
    const retagged = stored && (key.name !== live.name || key.version !== live.version)
      ? { stored: key, live }
      : undefined
    return [{
      ...workflow,
      version,
      tagName,
      activated: stored !== undefined,
      resultsView: resultsViewReading(rung),
      retagged,
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
