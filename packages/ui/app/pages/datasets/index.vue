<script setup lang="ts">
// import type { SupabaseTypes } from '#build/types/database'
import type { BreadcrumbItem, TableColumn } from '@nuxt/ui'

import type { Database } from 'nuxt-galaxy'
import type { DatasetsCountProvide } from '../../layouts/default.vue'
import * as bt from 'blendtype'
import { h, resolveComponent } from 'vue'
import * as z from 'zod'
import { getHumanSize } from '../../utils'

const props = withDefaults(defineProps<Props>(), {
  breadcrumbsItems: undefined,
})

type DatasetColumn = Database['galaxy']['Views']['uploaded_datasets_with_storage_path']['Row']

interface Props {
  breadcrumbsItems?: BreadcrumbItem[] | undefined
  datasets?: DatasetColumn[]
}
const breadcrumbsItems = toRef(() => props.breadcrumbsItems)
const ColumnTableSort = resolveComponent('ColumnTableSort')

const fileMetadataSchema = z.object({
  size: z.number(),
})

interface Dataset {
  name: string | null | undefined
  size?: string | undefined
  rawSize?: number | undefined
}

const datasetCountInjected = inject<DatasetsCountProvide>('datasetsCount')

const { refreshDatasetsCount } = datasetCountInjected || {}
const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()

const { data, refresh: refreshDatasets } = await useAsyncData<DatasetColumn[] | null | undefined>(
  'analysis-input-datasets',
  async () => {
    const userVal = toValue(user)

    if (!userVal) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized: User not found',
      })
    }

    const { data, error } = await supabase
      .schema('galaxy')
      .from(`uploaded_datasets_with_storage_path`)
      .select()
      .overrideTypes<DatasetColumn[]>()

    if (data === null) {
      throw createError({ statusMessage: 'No uploaded dataset found', statusCode: 404 })
    }
    if (error) {
      throw createError({ statusCode: bt.getStatusCode(error), statusMessage: bt.getErrorMessage(error) })
    }

    return data
  },
)
const sanitizedDatasets = computed<Dataset[] | undefined>(() => {
  const dataVal = toValue(data)
  if (dataVal) {
    return dataVal.map((d) => {
      let size: string | undefined
      const name = d.dataset_name
      const metadata = fileMetadataSchema.passthrough().parse(d.metadata)
      const rawSize = metadata.size
      if (rawSize) {
        size = getHumanSize(rawSize)
      }
      return {
        name,
        size,
        rawSize,
      }
    })
  }
  return undefined
})

async function handleUploadedFile() {
  refreshDatasets()
  if (!refreshDatasetsCount) {
    throw createError('datasetsCount not provided')
  }
  refreshDatasetsCount()
}

const columns = ref<TableColumn<Dataset>[]>([
  {
    accessorKey: 'name',
    sortingFn: 'alphanumeric',
    header: ({ column }) => {
      return h(ColumnTableSort, { column, label: 'Name' })
    },
  },
  {
    accessorKey: 'rawSize',
    sortingFn: 'basic',
    header: ({ column }) => {
      return h(ColumnTableSort, { column, label: 'Size' })
    },
  },
])

const utableProps = computed(() => {
  return {
    columns: toValue(columns),
    data: toValue(sanitizedDatasets),
  }
})

const pageHeaderProps = computed(() => {
  return {
    title: 'Datasets',
    description: 'From here you can upload a dataset and have the list of all the datasets available.',
    ui: {
      root: 'relative border-b-0 border-[var(--ui-border)] py-8',
    },

  }
})
</script>

<template>
  <PageHeader :page-header-props :breadcrumbs-items="breadcrumbsItems" icon="i-lucide-files" />
  <div class="grid grid-flow-row auto-rows-max gap-6 mt-6">
    <DatasetUpload @uploaded="handleUploadedFile" />

    <div v-if="sanitizedDatasets" class="mt-2">
      <div class="py-3">
        <TableGeneric :utable-props>
          <template #rawSize-cell="{ row }">
            <UBadge :label="row.original.size" variant="soft" color="neutral" />
          </template>
        </TableGeneric>
        <div class="flex my-2 py-3 justify-end">
          <UPageCard
            title="Run a workflow"
            description="Select a workflow and run it with one of the datasets listed above."
            icon="tabler:square-rounded-arrow-right" to="/workflows" variant="soft" class="w-64"
          />
        </div>
      </div>
    </div>
  </div>
</template>
