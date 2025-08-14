import type { MaybeRef } from 'vue'
import type { Database } from '../../types/database'
import { createError, useSupabaseClient } from '#imports'
import { ref, toValue, watchEffect } from 'vue'

export function useDownloadDataset(storageObjectId: MaybeRef<string | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const data = ref<Blob | null>(null)

  async function query(storageObjectId: MaybeRef<string | undefined>) {
    const storageObjectIdVal = toValue(storageObjectId)
    if (storageObjectIdVal) {
      const { data: storageObject } = await supabase
        .schema('storage')
        .from('objects')
        .select()
        .eq('id', storageObjectIdVal)
        .limit(1)
        .single()
      // const storageObjectVal = toValue(storageObject)

      if (storageObject && storageObject?.name) {
        const { name } = storageObject
        const { data: analysisFile, error } = await supabase
          .storage
          .from('avatars')
          .download(name)

        if (error) {
          throw createError(`Failed to download dataset: ${error.message}`)
        }

        if (data) {
          data.value = analysisFile
        }
      }
    }
  }
  watchEffect(() => {
    query(storageObjectId)
  })
  return { data }
}
