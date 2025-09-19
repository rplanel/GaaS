import { Data, Effect } from 'effect'
import { tags } from '../../db/schema/galaxy/tags'
import { Drizzle, sql } from '../drizzle'

export function insertTags(datasetTags: string[]) {
  return Effect.gen(function* () {
    const useDrizzle = yield* Drizzle
    return yield* Effect.tryPromise({
      try: () => useDrizzle
        .insert(tags)
        .values(datasetTags.map(label => ({ label })))
        .onConflictDoUpdate({ target: tags.label, set: { label: sql`excluded.label` } })
        .returning(),
      catch: error => new InsertTagsError({ message: `Error inserting analysis Output: ${error}` }),
    })
  })
}

export class InsertTagsError extends Data.TaggedError('InsertTagsError')<{
  readonly message: string
}> {}
