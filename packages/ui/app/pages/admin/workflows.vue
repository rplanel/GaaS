<script setup lang="ts">
import type { BadgeProps, BreadcrumbItem, TableColumn } from '@nuxt/ui'
import type { GalaxyWorkflowsItem } from 'blendtype'
import type { Database, WorkflowRow } from 'nuxt-galaxy'
import type { ResultsViewReading } from '../../utils/resultsViews'
import { resultsViews } from '#build/gaas/results-views.mjs'
import { log } from 'evlog/client'
import { describeActiveSwitchFailure } from '../../utils/activeSwitchFailure'
import { matchResultsView, resultsViewReading } from '../../utils/resultsViews'

/**
 * One version published for a stored workflow, with how its results view
 * reads to an administrator: a view of its own, something wider, or nothing.
 */
interface PublishedVersion {
  row: WorkflowRow
  resultsView: ResultsViewReading
}

/**
 * A stored workflow of the Galaxy account GaaS runs as, with the versions
 * published for it (ADR 0004). Tags play no part in whether it is listed.
 */
interface StoredWorkflowRow extends GalaxyWorkflowsItem {
  versions: PublishedVersion[]
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
const UButton = resolveComponent('UButton')
const USwitch = resolveComponent('USwitch')

/** The versions whose Active switch is waiting for the server's answer. */
const pendingVersions = reactive(new Set<number>())

/** The reading at a glance: a view of the version's own, something wider, or nothing. */
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

const columns = ref<TableColumn<StoredWorkflowRow>[]>([
  { accessorKey: 'name', header: 'Name' },
  {
    // Every version published for this stored workflow, each with the same
    // match the results page runs (ADR 0003), handed the name and the label
    // stored at publish, so the two agree. A developer sees here whether the
    // view directory they wrote is picked up for the version it is meant for.
    // Beside it, the Active switch: retiring a version hides it from users
    // and refuses new analyses on it, and nothing else (ADR 0004); the match
    // is made from the name and the label, so a retired version reads as it
    // did.
    accessorKey: 'versions',
    header: 'Versions',
    cell: ({ row }) => {
      const { versions } = row.original
      if (versions.length === 0) {
        return h('span', { 'data-testid': 'workflow-no-version', 'class': 'text-sm text-muted' }, 'No version yet')
      }
      return h('ul', { 'data-testid': 'workflow-versions', 'class': 'flex flex-col gap-1' }, versions.map(version =>
        h('li', { 'data-testid': 'workflow-version', 'class': 'flex items-center gap-2' }, [
          h(UBadge, { 'data-testid': 'version-label', 'variant': 'subtle', 'color': 'neutral' }, () => version.row.version_key),
          h(UBadge, {
            'data-testid': 'workflow-results-view',
            'variant': 'subtle',
            'color': resultsViewReadingColor[version.resultsView],
          }, () => version.resultsView),
          h(USwitch, {
            'data-testid': 'version-active',
            'label': 'Active',
            'size': 'sm',
            'modelValue': version.row.active,
            'loading': pendingVersions.has(version.row.id),
            'onUpdate:modelValue': (active: boolean) => setActive(version.row, active),
          }),
        ])))
    },
  },
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
    id: 'publish',
    header: '',
    cell: ({ row }) => {
      return h(UButton, {
        'data-testid': 'publish-version',
        'label': 'Publish',
        'icon': 'i-lucide-upload',
        'size': 'sm',
        'variant': 'subtle',
        'onClick': () => openPublishDialog(row.original),
      })
    },
  },
])

const { data: allWorkflows, error: errorWorkflows } = useQuery(() => galaxyWorkflowsListQuery())

if (toValue(errorWorkflows)) {
  const { errorStatus } = useErrorStatus(errorWorkflows)
  const { errorMessage } = useErrorMessage(errorWorkflows)
  throw createError({
    statusCode: toValue(errorStatus),
    statusMessage: toValue(errorMessage),
  })
}

const { data: galaxyInstance } = useQuery(() =>
  instanceByUrlQuery({
    supabase,
    instanceUrl: galaxyInstanceUrl,
  }),
)

// every version, retired ones included: the users' list query hides retired
// versions, and this page is where they are retired and made active again
const { data: dbWorkflows, refresh: refreshVersions } = useQuery(() => {
  return adminWorkflowsListQuery({ supabase })
})

/**
 * Retire a version, or make it active again. The switch stays where the row
 * says until the server has said yes and the list has been refetched, so what
 * the administrator reads is always what the database holds; a refusal is a
 * toast with the server's sentence, and the switch does not move.
 */
async function setActive(version: WorkflowRow, active: boolean) {
  pendingVersions.add(version.id)
  try {
    await $fetch<WorkflowRow>(`/api/db/workflows/${version.id}`, {
      method: 'PATCH',
      body: { active },
    })
    toast.add({
      title: active ? 'Version active again' : 'Version retired',
      description: active
        ? `${version.name_key} ${version.version_key} can be started again.`
        : `${version.name_key} ${version.version_key} is hidden from users; its past analyses are untouched.`,
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
    await refreshVersions()
  }
  catch (error) {
    // the cause itself is only ever worth a log, at `warn` when the
    // administrator can act on it and at `error` when the server could not
    // say why
    const status = toValue(useErrorStatus(error).errorStatus)
    const recoverable = status !== undefined && status >= 400 && status < 500
    log[recoverable ? 'warn' : 'error']({
      action: active ? 'workflow:make_active_failed' : 'workflow:retire_failed',
      tag: 'admin/workflows',
      versionId: version.id,
      status,
      error: String(error),
    })
    const failure = describeActiveSwitchFailure(error, active)
    toast.add({
      title: failure.title,
      description: failure.description,
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
  }
  finally {
    pendingVersions.delete(version.id)
  }
}

/** The versions published so far, grouped by the stored workflow they label. */
const versionsByStoredWorkflow = computed(() => {
  const groups = new Map<string, PublishedVersion[]>()
  for (const row of toValue(dbWorkflows) ?? []) {
    const { rung } = matchResultsView(resultsViews, { name: row.name_key, version: row.version_key })
    const versions = groups.get(row.galaxy_id) ?? []
    versions.push({ row, resultsView: resultsViewReading(rung) })
    groups.set(row.galaxy_id, versions)
  }
  return groups
})

/**
 * Every stored workflow of the account, the published ones first, otherwise
 * in the order Galaxy lists them.
 */
const storedWorkflows = computed<StoredWorkflowRow[]>(() => {
  const allWorkflowsVal = toValue(allWorkflows)
  if (!allWorkflowsVal) {
    return []
  }
  const rows = (allWorkflowsVal as GalaxyWorkflowsItem[]).map(workflow => ({
    ...workflow,
    versions: versionsByStoredWorkflow.value.get(workflow.id) ?? [],
  }))
  return [
    ...rows.filter(row => row.versions.length > 0),
    ...rows.filter(row => row.versions.length === 0),
  ]
})

/** The stored workflow the publish dialog is open for, if any. */
const workflowToPublish = ref<StoredWorkflowRow | undefined>()
const dialogOpen = ref(false)

function openPublishDialog(workflow: StoredWorkflowRow) {
  workflowToPublish.value = workflow
  dialogOpen.value = true
}

// the dialog is keyed on the stored workflow, so closing it forgets what was
// typed and the next one opens with its own pre-fill
watch(dialogOpen, (isOpen) => {
  if (!isOpen)
    workflowToPublish.value = undefined
})

function onPublished(version: WorkflowRow) {
  toast.add({
    title: 'Version published',
    description: `${version.name_key} ${version.version_key} is now available to users.`,
    color: 'success',
    icon: 'i-lucide-circle-check',
  })
  refreshVersions()
}

const pageHeaderProps = computed(() => {
  return {
    title: 'Workflows',
    description:
      'Publish versions of the Galaxy workflows this web application offers',
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
          v-if="allWorkflows" sticky :data="storedWorkflows" :columns="columns"
          class="flex-1 max-h-125"
        />
        <template #error="error">
          <pre>{{ error }}</pre>
        </template>
      </NuxtErrorBoundary>
      <AdminPublishVersionModal
        v-if="workflowToPublish"
        :key="workflowToPublish.id"
        v-model:open="dialogOpen"
        :workflow="workflowToPublish"
        :lineage-name="workflowToPublish.versions[0]?.row.name_key"
        :published-versions="workflowToPublish.versions.map(version => ({ revision: version.row.revision, label: version.row.version_key }))"
        @published="onPublished"
      />
    </div>
    <div v-else>
      <UAlert title="No Galaxy instance defined" />
    </div>
  </div>
</template>
