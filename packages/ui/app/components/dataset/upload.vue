<script setup lang="ts">
import * as z from 'zod'

const emit = defineEmits<{
  (e: 'uploaded'): void
}>()
const fileUploadSchema = z.object({
  file: z.any(),
})
const toast = useToast()

type FileUploadSchema = z.output<typeof fileUploadSchema>
const fileUploadState = reactive<Partial<FileUploadSchema>>({
  file: undefined,
})

const { uploadFileToStorage, pending } = useUploadFileToStorage({ bucket: 'analysis_files' })

async function uploadFile() {
  const file = fileUploadState.file
  // const file = event.target.files?.[0] as File | null
  // selectedFile.value = file
  if (!file) {
    return
  }
  return uploadFileToStorage(file).then(() => {
    emit('uploaded')
  }).finally(() => {
    // Clear the file input after upload
    fileUploadState.file = undefined
  })
}

watch(fileUploadState, () => {
  if (fileUploadState.file) {
    toast.add({
      title: `Uploading file ${fileUploadState.file?.name || ''}...`,
      color: 'info',
      progress: true,
    })
    uploadFile()
  }
})
</script>

<template>
  <UForm :schema="fileUploadSchema" :state="fileUploadState">
    <UProgress v-if="pending" />
    <UFormField name="file">
      <UFileUpload v-model="fileUploadState.file" label="Select a file or drag and drop it" highlight reset layout="list" />
    </UFormField>
  </UForm>
</template>
