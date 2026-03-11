import type { PostgrestError } from '@supabase/postgrest-js'
import type { StorageError } from '@supabase/storage-js'
import type { Ref } from 'vue'
import type { Database } from '../../types/database'
import { useSupabaseClient } from '#imports'
import { useAsyncState } from '@vueuse/core'
import { ref, toValue, watch } from 'vue'

export function useDownloadDataset(datasetId: Ref<number | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const error = ref<StorageError | PostgrestError | undefined>(undefined)

  async function query() {
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
        const { data: analysisFile, error: storageError } = await supabase
          .storage
          .from('analysis_files')
          .download(storagePath)

        if (storageError) {
          error.value = storageError
          return
        }

        if (analysisFile) {
          try {
            const text = await analysisFile.text()
            return text
          }
          catch (error) {
            console.error('Error reading analysis file as text:', error)
          }
        }
      }
    }
  }

  const { state: dataText, isReady, isLoading, execute } = useAsyncState(query, '', {
    immediate: false,
  })

  execute()
  watch(datasetId, () => {
    execute()
  })

  return { dataText, error, isReady, isLoading, execute }
}
