<script setup lang="ts">
// import type { SupabaseTypes } from '#build/types/database'
import type { BreadcrumbItem, TableColumn } from '@nuxt/ui'

import type { GalaxyWorkflowsItem } from 'blendtype'
import type { Database } from 'nuxt-galaxy'
import { USwitch } from '#components'
import * as bt from 'blendtype'
import { workflowsListQuery as galaxyWorkflowListQuery } from '../../utils/queries/galaxy'
import {
  instanceByUrlQuery,
  workflowsListQuery,
} from '../../utils/queries/supabase'
// type Database = SupabaseTypes.Database

interface ComputedGalaxyWorklowItem extends GalaxyWorkflowsItem {
  version: string | boolean
  activated: boolean
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
    header: 'Activated',
    cell: ({ row }) => {
      return h(USwitch, {
        class: 'text-right',
        modelValue: row.original.activated,
        disabled: row.original.activated,
        onChange() {
          addToDb({ id: row.original.id })

          toast.add({
            title: 'Workflow added to the webservice',
            color: 'success',
            icon: 'i-lucide-circle-check',
          })
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
    router.push('/workflows')
  }
  catch (error) {
    showError({
      statusCode: bt.getStatusCode(error),
      statusMessage: bt.getErrorMessage(error),
    })
  }
}

const { data: allWorkflows, error: errorWorkflows } = useQuery(() => galaxyWorkflowListQuery())

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

const computedWorkflows = computed(() => {
  const allWorkflowsVal = toValue(allWorkflows)

  if (allWorkflowsVal) {
    return allWorkflowsVal
      .map((workflow) => {
        const version = bt.getWorkflowTagVersion(workflow.tags)
        const tagName = bt.getWorkflowTagName(workflow.tags)
        return {
          ...workflow,
          version,
          tagName,
          activated: dbWorkflowsMap.value.has(workflow.id),
        }
      })
      .filter(({ version, tagName }) => version !== null && tagName !== null)
  }
  return []
})

const pageHeaderProps = computed(() => {
  return {
    title: 'Workflows',
    description:
      'Manage the workflows that are available for this web application',
  }
})
</script>

<template>
  <div v-if="userRole === 'admin'">
    <div v-if="galaxyInstance">
      <PageHeader :page-header-props icon="i-lucide:workflow" :breadcrumbs-items="computedBreadcrumbsItems">
        <template #trailing-content>
          <UBadge variant="subtle" color="info">
            {{ galaxyInstance.name }}
          </UBadge>
        </template>
      </PageHeader>
      <NuxtErrorBoundary>
        <UTable
          v-if="allWorkflows" sticky :data="computedWorkflows" :columns="galaxyWorkflowGalaxyColumns"
          class="flex-1 max-h-[500px]"
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
