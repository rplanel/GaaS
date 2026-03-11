import type { PostgrestError } from '@supabase/postgrest-js'
import type { StorageError } from '@supabase/storage-js'
import type { MaybeRef } from 'vue'
import type { Database } from '../../types/database'
import { useSupabaseClient } from '#imports'
import { ref, toValue, watchEffect } from 'vue'

export function useDatasetSignedUrl(datasetId: MaybeRef<number | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const signedUrl = ref<string | undefined>(undefined)
  const error = ref<PostgrestError | StorageError | undefined>(undefined)
  async function query(datasetId: MaybeRef<number | undefined>) {
    const datasetIdVal = toValue(datasetId)
    if (datasetIdVal) {
      const { data: dataset, error: postgresError } = await supabase
        .schema('galaxy')
        .from('datasets')
        .select('storage_path')
        .eq('id', datasetIdVal)
        .limit(1)
        .single()

      if (postgresError) {
        error.value = postgresError
        return
      }
      const storagePath = (dataset as { storage_path?: string })?.storage_path
      if (storagePath) {
        const { data, error: storageError } = await supabase.storage
          .from('analysis_files')
          .createSignedUrl(storagePath, 60)
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
    query(datasetId)
  })
  return { signedUrl, error }
}
