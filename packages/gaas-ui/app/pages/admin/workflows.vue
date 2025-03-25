<script setup lang="ts">
import type { SupabaseTypes } from '#build/types/database'
import type { BreadcrumbItem, TableColumn } from '@nuxt/ui'
import type { Row } from '@tanstack/vue-table'

import type { GalaxyWorkflowsItem } from 'blendtype'
import {

  getErrorMessage,
  getStatusCode,
} from 'blendtype'

type Database = SupabaseTypes.Database

interface Props {
  breadcrumbsItems?: BreadcrumbItem[] | undefined
}
const props = withDefaults(defineProps<Props>(), { breadcrumbsItems: undefined })

const { breadcrumbsItems } = toRefs(props)

const toast = useToast()
const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UButton = resolveComponent('UButton')

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
      ...breadcrumbsItemsVal.map(breadcrumb => ({ ...breadcrumb, disabled: false })),
      {
        label: 'Workflows',
        disabled: true,
        to: '/admin/workflows',
      },
    ]
  }
  return breadcrumbsItemsVal
})

const galaxyWorkflowGalaxyColumns = ref<TableColumn<GalaxyWorkflowsItem>[]>([
  { accessorKey: 'name', header: 'Name' },
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
    id: 'actions',
    cell: ({ row }) => {
      return h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: {
              align: 'end',
            },
            items: getRowItems(row),
          },
          () =>
            h(UButton, {
              icon: 'i-lucide-ellipsis-vertical',
              color: 'neutral',
              variant: 'ghost',
              class: 'ml-auto',
            }),
        ),
      )
    },
  },
])

function getRowItems(row: Row<GalaxyWorkflowsItem>) {
  return [
    {
      type: 'label',
      label: 'Actions',
    },
    {
      icon: 'i-lucide:plus',
      label: 'Add to webservice',
      onSelect() {
        addToDb({ id: row.original.id })

        toast.add({
          title: 'Workflow added to the webservice',
          color: 'success',
          icon: 'i-lucide-circle-check',
        })
      },
    },
  ]
}

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
    throw createError({
      statusCode: getStatusCode(error),
      statusMessage: getErrorMessage(error),
    })
  }
}

const { data: allWorkflows, error: errorWorklows } = await useFetch<GalaxyWorkflowsItem[]>('/api/galaxy/workflows')
if (toValue(errorWorklows)) {
  const { errorStatus } = useErrorStatus(errorWorklows)
  const { errorMessage } = useErrorMessage(errorWorklows)
  throw createError({
    statusCode: toValue(errorStatus),
    statusMessage: toValue(errorMessage),
  })
}

const { data: galaxyInstance } = await useAsyncData(
  'current-galaxy-instance',
  async () => {
    if (galaxyInstanceUrl) {
      const { data, error } = await supabase
        .schema('galaxy')
        .from('instances')
        .select()
        .eq('url', galaxyInstanceUrl)
        .limit(1)
        // .returns<GalaxyInstanceRow[]>()
        // .then(takeUniqueOrThrow)

      if (error) {
        throw createError({
          statusMessage: error.message,
          statusCode: Number.parseInt(error.code),
        })
      }
      if (data.length >= 1) {
        return data[0]
      }
      else {
        throw createError({
          statusMessage: 'No Galaxy instance found',
          statusCode: 404,
        })
      }
    }
  },
)

const pageHeaderProps = computed(() => {
  return {
    title: 'Workflows',
    description: 'Manage the workflows that are available for this web application',

  }
})
</script>

<template>
  <div v-if="userRole === 'admin'">
    <div v-if="galaxyInstance">
      <PageHeader
        :page-header-props
        icon="i-lucide:workflow"
        :breadcrumbs-items="computedBreadcrumbsItems"
      >
        <template #trailing-content>
          <UBadge variant="subtle" color="info">
            {{
              galaxyInstance.name
            }}
          </UBadge>
        </template>
      </PageHeader>

      <UTable
        v-if="allWorkflows" sticky :data="allWorkflows" :columns="galaxyWorkflowGalaxyColumns"
        class="flex-1 max-h-[500px]"
      />
    </div>
    <div v-else>
      <UAlert title="No Galaxy instance defined" />
    </div>
  </div>
</template>
