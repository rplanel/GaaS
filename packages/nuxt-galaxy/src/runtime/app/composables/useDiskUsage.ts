import { Data, Effect } from 'effect'
import { ref } from 'vue'
import { SupabaseClientLayer } from '../utils/supabase'

export class ListDatasetsError extends Data.TaggedError('CreateSignedUrlError')<{
  readonly message: string
}> {}

/**
 * A composable function to fetch the disk usage of the storage bucket.
 * It uses the Supabase client to query the storage objects and calculates
 * the total size of all objects in the bucket.
 *
 * @returns An object containing the disk usage and a function to refresh it.
 */
export function useDiskUsage() {
  const diskUsage = ref(0)

  const program = Effect.gen(function* () {
    const supabase = yield* SupabaseClientLayer
    const { data, error } = yield* Effect.promise(
      () => supabase
        .schema('storage')
        .from('objects')
        .select(),
    )
    if (error) {
      yield* Effect.fail(new ListDatasetsError({ message: error.message }))
    }
    return data
  })

  function getDiskUsage() {
    return Effect.runPromise(
      Effect.provide(
        program,
        SupabaseClientLayer.Live,
      ),
    ).then((data) => {
      if (data) {
        diskUsage.value = data.reduce((acc, item) => {
          if (!item.metadata) {
            return acc
          }
          // Ensure metadata and size exist
          const metadataItem = item as { metadata: { size?: number } }
          if (typeof metadataItem.metadata.size !== 'number') {
            return acc
          }
          return acc + metadataItem.metadata.size
        }, 0)
      }
      return data
    })
  }
  getDiskUsage()
  return {
    diskUsage,
    getDiskUsage,
  }
}
