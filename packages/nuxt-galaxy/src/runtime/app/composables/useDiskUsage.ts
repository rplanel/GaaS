import type { Database } from '../../types/database'
import { useSupabaseClient, useSupabaseUser } from '#imports'
import { useQuery } from '@pinia/colada'
import { computed } from 'vue'

import { diskUsageByUserQuery } from '../queries/supabase/diskUsage'

// interface UseDiskUsageOptions {
//   user: Ref<ReturnType<typeof useSupabaseUser>>
// }

export function useDiskUsage() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const query = useQuery(() => {
    const userId = user.value?.sub
    if (!userId) {
      return {
        key: ['disk-usage', 'pending'],
        enabled: false,
        query: async () => 0,
      }
    }
    return diskUsageByUserQuery({ supabase, userId })
  })

  const diskUsage = computed(() => query.data.value ?? 0)

  return { diskUsage, ...query }
}
