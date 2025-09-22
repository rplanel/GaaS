import type { PostgrestError } from '@supabase/postgrest-js'
import type { StorageError } from '@supabase/storage-js'
import type { Ref } from 'vue'
import type { Database } from '../../types/database'
import { useSupabaseClient } from '#imports'
import { useAsyncState } from '@vueuse/core'
import { ref, toValue, watch } from 'vue'

export function useDownloadDataset(storageObjectId: Ref<string | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const error = ref<StorageError | PostgrestError | undefined>(undefined)

  async function query() {
    const storageObjectIdVal = toValue(storageObjectId)
    if (storageObjectIdVal) {
      const { data: storageObject, error: postgresError } = await supabase
        .schema('storage')
        .from('objects')
        .select()
        .eq('id', storageObjectIdVal)
        .limit(1)
        .single()
      if (postgresError) {
        error.value = postgresError
        return
      }
      if (storageObject && storageObject?.name) {
        const { name } = storageObject
        const { data: analysisFile, error: storageError } = await supabase
          .storage
          .from('analysis_files')
          .download(name)

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
  watch(storageObjectId, () => {
    execute()
  })

  return { dataText, error, isReady, isLoading, execute }
}
