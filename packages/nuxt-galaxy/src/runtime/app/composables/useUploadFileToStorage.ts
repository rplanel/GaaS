import type { MaybeRef } from 'vue'
import { Effect } from 'effect'
import { ref, toValue } from 'vue'
import { insertUploadedDatasetEffect, SupabaseConfigLive, uploadFileToStorageEffect } from '../utils/supabase'

export interface UploadFileToStorageOptions {
  bucket: MaybeRef<string>
}

export function useUploadFileToStorage({
  bucket,
}: UploadFileToStorageOptions) {
  const pending = ref(false)

  const program = (file: File) => Effect.gen(function* () {
    const uploadedFile = yield* uploadFileToStorageEffect(
      toValue(bucket),
      file,
    )
    if (!uploadedFile) {
      return null
    }
    return yield* insertUploadedDatasetEffect({
      storageObjectId: uploadedFile.id,
      datasetName: file.name,
    })
  })

  function uploadFileToStorage(file: File) {
    pending.value = true
    return Effect.runPromise(
      Effect.provide(
        program(file),
        SupabaseConfigLive,
      ),
    ).finally(() => {
      pending.value = false
    })
  }
  return {
    uploadFileToStorage,
    pending,
  }
}
