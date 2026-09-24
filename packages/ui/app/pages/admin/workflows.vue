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
 * A row of the table: a stored workflow of the Galaxy account GaaS runs as,
 * with the versions published for it (ADR 0004). Tags play no part in whether
 * it is listed. `galaxy` is the stored workflow as Galaxy lists it, and is
 * absent when Galaxy no longer lists it (#76): the versions published for it
 * still get a row, named from the snapshot taken at publish, so a stored
 * workflow deleted on the Galaxy side does not drop out of the page silently
 * and its versions can be retired from here. Nothing can be published for it.
 */
interface StoredWorkflowRow {
  /** The stored workflow's Galaxy id, whether or not Galaxy still lists it. */
  id: string
  /** Galaxy's display name, or the snapshot's when Galaxy no longer lists the workflow. */
  name: string
  galaxy?: GalaxyWorkflowsItem
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
const AdminVersionStateBadge = resolveComponent('AdminVersionStateBadge')

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
    // did. Then the state of the version (#76): whether it can still run,
    // read live from Galaxy once per version and never stored; nothing is
    // retired from it, the administrator reads it and decides. Last, Delete,
    // for the mistaken publish (#72): it opens a confirmation naming the
    // version, and the database refuses a version that has analyses.
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
          h(AdminVersionStateBadge, { version: version.row }),
          h(USwitch, {
            'data-testid': 'version-active',
            'label': 'Active',
            'size': 'sm',
            'modelValue': version.row.active,
            'loading': pendingVersions.has(version.row.id),
            'onUpdate:modelValue': (active: boolean) => setActive(version.row, active),
          }),
          h(UButton, {
            'data-testid': 'version-delete',
            'aria-label': `Delete version ${version.row.version_key}`,
            'icon': 'i-lucide-trash-2',
            'size': 'xs',
            'color': 'error',
            'variant': 'ghost',
            'onClick': () => openDeleteDialog(version.row),
          }),
        ])))
    },
  },
  {
    // what Galaxy says about the stored workflow, blank when Galaxy no
    // longer lists it (#76): the snapshot holds the steps, but as they were
    // at publish, which is not what this column reads
    id: 'number_of_steps',
    accessorFn: row => row.galaxy?.number_of_steps,
    header: 'Number of steps',
    cell: ({ row }) => {
      const steps = row.original.galaxy?.number_of_steps
      return steps === undefined ? null : h(UBadge, { class: 'capitalize', variant: 'subtle' }, () => steps)
    },
  },
  {
    id: 'create_time',
    accessorFn: row => row.galaxy?.create_time,
    header: 'Create time',
    cell: ({ row }) => {
      const createTime = row.original.galaxy?.create_time
      if (createTime === undefined)
        return null
      return new Date(createTime).toLocaleString('en-US', {
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
      // nothing can be published for a stored workflow Galaxy no longer
      // lists: there is no revision to export
      if (!row.original.galaxy)
        return null
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
// versions, and this page is where they are retired and made active again.
// `refetch`, not `refresh`: refresh honours the stale window, so a publish, a
// retire or a delete within five seconds of the last read would show the
// list as it was (#72); after a write the list is read again, whatever its age
const { data: dbWorkflows, refetch: refetchVersions } = useQuery(() => {
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
    await refetchVersions()
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
 * Every stored workflow of the account, in three groups: first the ones
 * Galaxy no longer lists but versions were published for (#76), since they
 * need the administrator's decision; then the published ones; then the rest,
 * each group in the order Galaxy lists them.
 */
const storedWorkflows = computed<StoredWorkflowRow[]>(() => {
  const allWorkflowsVal = toValue(allWorkflows)
  if (!allWorkflowsVal) {
    return []
  }
  const listed = (allWorkflowsVal as GalaxyWorkflowsItem[]).map<StoredWorkflowRow>(workflow => ({
    id: workflow.id,
    name: workflow.name,
    galaxy: workflow,
    versions: versionsByStoredWorkflow.value.get(workflow.id) ?? [],
  }))
  const listedIds = new Set(listed.map(row => row.id))
  const gone: StoredWorkflowRow[] = []
  for (const [galaxyId, versions] of versionsByStoredWorkflow.value) {
    if (listedIds.has(galaxyId))
      continue
    // named from the snapshot taken at publish, Galaxy having nothing to say
    // about it any more; every version of a stored workflow shares that name
    gone.push({ id: galaxyId, name: versions[0]!.row.name ?? versions[0]!.row.name_key, versions })
  }
  return [
    ...gone,
    ...listed.filter(row => row.versions.length > 0),
    ...listed.filter(row => row.versions.length === 0),
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

/** The version the delete confirmation is open for, if any. */
const versionToDelete = ref<WorkflowRow | undefined>()
const deleteDialogOpen = ref(false)

function openDeleteDialog(version: WorkflowRow) {
  versionToDelete.value = version
  deleteDialogOpen.value = true
}

// keyed on the version, so closing it forgets any refusal it showed
watch(deleteDialogOpen, (isOpen) => {
  if (!isOpen)
    versionToDelete.value = undefined
})

function onDeleted(version: WorkflowRow) {
  toast.add({
    title: 'Version deleted',
    description: `${version.name_key} ${version.version_key} is gone; revision ${version.revision} can be published again under another label.`,
    color: 'success',
    icon: 'i-lucide-circle-check',
  })
  refetchVersions()
}

function onPublished(version: WorkflowRow) {
  toast.add({
    title: 'Version published',
    description: `${version.name_key} ${version.version_key} is now available to users.`,
    color: 'success',
    icon: 'i-lucide-circle-check',
  })
  refetchVersions()
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
        v-if="workflowToPublish?.galaxy"
        :key="workflowToPublish.id"
        v-model:open="dialogOpen"
        :workflow="workflowToPublish.galaxy"
        :lineage-name="workflowToPublish.versions[0]?.row.name_key"
        :published-versions="workflowToPublish.versions.map(version => ({ revision: version.row.revision, label: version.row.version_key }))"
        @published="onPublished"
      />
      <AdminDeleteVersionModal
        v-if="versionToDelete"
        :key="versionToDelete.id"
        v-model:open="deleteDialogOpen"
        :version="versionToDelete"
        @deleted="onDeleted"
      />
    </div>
    <div v-else>
      <UAlert title="No Galaxy instance defined" />
    </div>
  </div>
</template>
