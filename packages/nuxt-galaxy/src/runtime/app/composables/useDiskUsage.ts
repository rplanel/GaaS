import { Data, Effect } from 'effect'
import { ref } from 'vue'
import { ClientSupabaseClient } from '../utils/supabase'

// eslint-disable-next-line unicorn/throw-new-error
export class ListDatasetsError extends Data.TaggedError('CreateSignedUrlError')<{
  readonly message: string
}> {}

export function useDiskUsage() {
  const diskUsage = ref(0)

  const program = Effect.gen(function* () {
    const supabase = yield* ClientSupabaseClient
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
        ClientSupabaseClient.Live,
      ),
    ).then((data) => {
      if (data) {
        diskUsage.value = data.reduce((acc, item) => acc + item.metadata.size, 0)
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
