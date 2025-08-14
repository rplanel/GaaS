import type { MaybeRef } from 'vue'
import type { Database } from '../../types/database'
import { useSupabaseClient } from '#imports'
import { ref, toValue, watchEffect } from 'vue'

export function useDatasetSignedUrl(storageObjectId: MaybeRef<string | undefined>) {
  const supabase = useSupabaseClient<Database>()

  const signedUrl = ref<string | undefined>(undefined)
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
        const { data } = await supabase.storage
          .from('analysis_files')
          .createSignedUrl(storageObject.name, 60)
        if (data) {
          signedUrl.value = data.signedUrl
        }
      }
    }
  }
  watchEffect(() => {
    query(storageObjectId)
  })
  return { signedUrl }
}
