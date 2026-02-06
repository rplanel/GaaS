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
  if (!file) {
    return
  }

  try {
    await uploadFileToStorage(file)

    toast.add({
      title: `File ${file.name} uploaded successfully`,
      color: 'success',
    })
    emit('uploaded')
    // Only clear the file on success
    fileUploadState.file = undefined
  }
  catch (error: any) {
    let errorMessage = 'Failed to upload file'

    // Handle specific error types
    if (error.statusCode === 413) {
      errorMessage = 'File is too large. Please upload a smaller file.'
    }
    else if (error.statusCode === 401 || error.statusCode === 403) {
      errorMessage = 'You do not have permission to upload this file.'
    }
    else if (error.statusCode >= 500) {
      errorMessage = 'Server error. Please try again later.'
    }
    else if (error.message) {
      errorMessage = `Upload failed: ${error.message}`
    }

    toast.add({
      title: 'Upload Failed',
      description: errorMessage,
      color: 'error',
    })
  }
  finally {
    // Clear the file input regardless of success or failure to allow retrying with the same file
    fileUploadState.file = undefined
  }
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
