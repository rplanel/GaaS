import type { PostgrestError } from '@supabase/postgrest-js'
import type { StorageError } from '@supabase/storage-js'
import type { MaybeRef } from 'vue'
import type { Database } from '../../types/database'
import { useSupabaseClient } from '#imports'
import { ref, toValue, watchEffect } from 'vue'

export function useDatasetSignedUrl(storageObjectId: MaybeRef<string | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const signedUrl = ref<string | undefined>(undefined)
  const error = ref<PostgrestError | StorageError | undefined>(undefined)
  async function query(storageObjectId: MaybeRef<string | undefined>) {
    const storageObjectIdVal = toValue(storageObjectId)
    if (storageObjectIdVal) {
      const { data: storageObject, error: postgresError } = await supabase
        .schema('storage')
        .from('objects')
        .select()
        .eq('id', storageObjectIdVal)
        .limit(1)
        .single()

      // const storageObjectVal = toValue(storageObject)
      if (postgresError) {
        error.value = postgresError
        return
      }
      if (storageObject && storageObject?.name) {
        const { data, error: storageError } = await supabase.storage
          .from('analysis_files')
          .createSignedUrl(storageObject.name, 60)
        if (storageError) {
          error.value = storageError
          return
        }
        if (data) {
          signedUrl.value = data.signedUrl
        }
      }
    }
  }
  watchEffect(() => {
    query(storageObjectId)
  })
  return { signedUrl, error }
}
