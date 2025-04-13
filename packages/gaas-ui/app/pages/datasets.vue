<script setup lang="ts">
import type { SupabaseTypes } from '#build/types/database'
import type { BreadcrumbItem } from '#ui/types'
import { z } from 'zod'

type Database = SupabaseTypes.Database

const breadcrumbsItems = ref<BreadcrumbItem[]>([
  {
    icon: 'lucide:house',
    disabled: false,
    to: '/',
  },
  {
    label: 'Datasets',
    disabled: true,
    to: '/datasets',
  },
])
const toast = useToast()
const fileRef = ref<HTMLInputElement>()
const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const uploadingFile = ref(false)
const schema = z.object({
  file: z.any(),
})
type DatasetColumn = Database['galaxy']['Views']['uploaded_datasets_with_storage_path']['Row']

type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({
  file: undefined,
})

const { refreshDatasetsCount } = inject('datasetsCount')

const uploadError = ref<string | null>(null)

watch(uploadError, (error) => {
  if (error) {
    toast.add({
      'title': 'Uh oh! Something went wrong.',
      'description': getErrorMessage(error),
      'icon': 'ic:baseline-error-outline',
      'color': 'error',
      'onUpdate:open': (isOpen) => {
        if (!isOpen) {
          clearError()
          uploadError.value = null
        }
      },

    })
  }
})

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
      .returns<DatasetColumn[]>()

    if (data === null) {
      throw createError({ statusMessage: 'No uploaded dataset found', statusCode: 404 })
    }
    if (error) {
      throw createError({ statusCode: getStatusCode(error), statusMessage: getErrorMessage(error) })
    }

    return data
  },
)
const selectedFile = ref<File | null>(null)

const { uploadFileToStorage, pending } = useUploadFileToStorage({ bucket: 'analysis_files' })

async function uploadFile(event: any) {
  const file = event.target.files?.[0] as File | null
  selectedFile.value = file
  if (!file) {
    return
  }
  return uploadFileToStorage(file).then(() => {
    refreshDatasets()
    refreshDatasetsCount()
  })
}
function onFileClick() {
  fileRef.value?.click()
}
</script>

<template>
  <UDashboardPanel id="datasets-panel" title="Datasets">
    <template #header>
      <UDashboardNavbar title="Datasets" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <!-- <NuxtErrorBoundary @error="(error) => uploadError = error"> -->
          <UForm :schema="schema" :state="state">
            <UButton
              icon="i-lucide-plus" size="md" class="rounded-full" :disabled="uploadingFile"
              :loading="pending" @click="onFileClick"
            />
            <input ref="fileRef" type="file" class="hidden" @change="uploadFile">
          </UForm>
          <!-- </NuxtErrorBoundary> -->
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <UPage>
        <NuxtPage :breadcrumbs-items="breadcrumbsItems" :datasets="data" />
      </UPage>
    </template>
  </UDashboardPanel>
</template>
