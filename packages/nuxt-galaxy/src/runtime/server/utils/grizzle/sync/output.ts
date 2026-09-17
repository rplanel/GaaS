import type { SupabaseClient } from '@supabase/supabase-js'
import type { Layer } from 'effect'
import type { Database } from '../../../../types/database'
import * as bt from 'blendtype'
import { Data, Effect } from 'effect'
import { logStreamBytes } from '../stream-log'
import { uploadStreamToStorage } from '../supabase'

// Sync trace fields: see .planning/LOGGING-SPEC.md ## Sync trace field allowlist

export class SyncOutputError extends Data.TaggedError('SyncOutputError')<{
  readonly message: string
}> {}

async function updateStorageObjectOwner(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  objectId: string,
): Promise<{ data: unknown, error: { message: string } | null }> {
  // The generated Database type does not include the Supabase storage schema,
  // so we cast to a minimal schema-aware client for this single operation.
  const storageClient = supabase as unknown as SupabaseClient<{
    storage: {
      Tables: {
        objects: {
          Update: { owner?: string }
        }
      }
    }
  }>
  return storageClient
    .schema('storage')
    .from('objects')
    .update({ owner: ownerId })
    .eq('id', objectId)
}

export function syncOutputDatasetEffect(
  galaxyDatasetId: string,
  analysisId: number,
  historyId: number,
  jobId: number,
  ownerId: string,
  supabase: SupabaseClient<Database>,
  galaxyLayer: Layer.Layer<bt.GalaxyFetch>,
): Effect.Effect<void, SyncOutputError, never> {
  return Effect.gen(function* () {
    const { data: existing, error: existingError } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('analysis_outputs')
          .select('id, dataset_id, state, datasets!inner(id, galaxy_id, storage_object_id)')
          .eq('analysis_id', analysisId)
          .eq('job_id', jobId)
          .eq('datasets.galaxy_id', galaxyDatasetId)
          .maybeSingle(),
      catch: error =>
        new SyncOutputError({
          message: `Failed to query existing output dataset: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })

    if (existingError) {
      yield* Effect.logError('failed to query existing output dataset', { message: existingError.message })
      return yield* Effect.fail(
        new SyncOutputError({ message: `Failed to query existing output dataset: ${existingError.message}` }),
      )
    }

    const { data: history, error: historyError } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('histories')
          .select('galaxy_id')
          .eq('id', historyId)
          .single(),
      catch: error =>
        new SyncOutputError({
          message: `Failed to query history: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })

    if (historyError) {
      yield* Effect.logError('failed to query history', { message: historyError.message })
      return yield* Effect.fail(
        new SyncOutputError({ message: `Failed to query history: ${historyError.message}` }),
      )
    }

    if (!history) {
      return yield* Effect.fail(
        new SyncOutputError({ message: `History ${historyId} not found` }),
      )
    }

    const historyGalaxyId = history.galaxy_id

    const galaxyDataset = yield* bt
      .getDatasetEffect(galaxyDatasetId, historyGalaxyId)
      .pipe(
        Effect.mapError(error =>
          new SyncOutputError({
            message: `Failed to fetch dataset from Galaxy: ${error instanceof Error ? error.message : String(error)}`,
          }),
        ),
        Effect.provide(galaxyLayer),
      )

    if (existing && existing.datasets && existing.datasets.storage_object_id && existing.state === galaxyDataset.state) {
      yield* Effect.logDebug('output dataset unchanged, skipping upload', { datasetId: galaxyDatasetId })
      return
    }

    const isTerminalOk = galaxyDataset.state === 'ok'

    let storageObjectId: string | null = null
    let storagePath: string | null = null

    if (isTerminalOk) {
      const downloadResult = yield* Effect.gen(function* () {
        const runtime = yield* Effect.runtime()
        yield* Effect.logDebug('dataset download started', {
          analysisId,
          ownerId,
          galaxyInvocationId: null,
          historyId: historyGalaxyId,
          jobId,
          datasetId: galaxyDatasetId,
        })
        const stream = yield* bt
          .downloadDatasetStreamEffect(historyGalaxyId, galaxyDatasetId)
          .pipe(
            Effect.tapError(error =>
              Effect.logError('failed to download dataset stream from Galaxy', {
                message: error instanceof Error ? error.message : String(error),
              }),
            ),
            Effect.mapError(error =>
              new SyncOutputError({
                message: `Failed to download dataset stream from Galaxy: ${error instanceof Error ? error.message : String(error)}`,
              }),
            ),
            Effect.provide(galaxyLayer),
          )
        yield* Effect.logDebug('dataset download returned', {
          hasStream: stream !== null,
          analysisId,
          ownerId,
          galaxyInvocationId: null,
          historyId: historyGalaxyId,
          jobId,
          datasetId: galaxyDatasetId,
        })

        let resultStorageObjectId: string | null = null
        let resultStoragePath: string | null = null

        if (stream) {
          const path = `${crypto.randomUUID()}/${galaxyDataset.name}`
          const loggedStream = logStreamBytes(stream, runtime, historyGalaxyId, galaxyDatasetId)
          const uploaded = yield* uploadStreamToStorage(supabase, path, loggedStream).pipe(
            Effect.mapError(error =>
              new SyncOutputError({ message: `Failed to upload stream to storage: ${error.message}` }),
            ),
          )
          resultStorageObjectId = uploaded.id
          resultStoragePath = uploaded.path

          // Service-role uploads have no authenticated user context, so Supabase Storage
          // leaves storage.objects.owner empty. Set it to the dataset owner so the
          // standard "Users can view their own files" RLS policy covers these outputs.
          const { error: ownerUpdateError } = yield* Effect.tryPromise({
            try: () => updateStorageObjectOwner(supabase, ownerId, uploaded.id),
            catch: error =>
              new SyncOutputError({
                message: `Failed to update storage object owner: ${error instanceof Error ? error.message : String(error)}`,
              }),
          })

          if (ownerUpdateError) {
            return yield* Effect.fail(
              new SyncOutputError({ message: `Failed to update storage object owner: ${ownerUpdateError.message}` }),
            )
          }
        }

        return { storageObjectId: resultStorageObjectId, storagePath: resultStoragePath }
      }).pipe(
        Effect.annotateLogs({
          analysisId: String(analysisId),
          ownerId,
          galaxyInvocationId: null,
          historyId: historyGalaxyId,
          jobId,
          datasetId: galaxyDatasetId,
        }),
      )

      storageObjectId = downloadResult.storageObjectId
      storagePath = downloadResult.storagePath
    }

    if (existing) {
      const { error: datasetUpdateError } = yield* Effect.tryPromise({
        try: () =>
          supabase
            .schema('galaxy')
            .from('datasets')
            .update({
              dataset_name: galaxyDataset.name,
              galaxy_metadata: {
                extension: galaxyDataset.extension,
                data_lines: galaxyDataset.metadata_data_lines || 0,
                misc_blurb: galaxyDataset.misc_blurb || undefined,
                peek: galaxyDataset.peek || undefined,
              },
              storage_object_id: storageObjectId,
              storage_path: storagePath,
            })
            .eq('id', existing.dataset_id),
        catch: error =>
          new SyncOutputError({
            message: `Failed to update dataset: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })

      if (datasetUpdateError) {
        return yield* Effect.fail(
          new SyncOutputError({ message: `Failed to update dataset: ${datasetUpdateError.message}` }),
        )
      }

      const { error: outputUpdateError } = yield* Effect.tryPromise({
        try: () =>
          supabase
            .schema('galaxy')
            .from('analysis_outputs')
            .update({ state: galaxyDataset.state })
            .eq('id', existing.id),
        catch: error =>
          new SyncOutputError({
            message: `Failed to update analysis output: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })

      if (outputUpdateError) {
        return yield* Effect.fail(
          new SyncOutputError({ message: `Failed to update analysis output: ${outputUpdateError.message}` }),
        )
      }

      yield* Effect.logDebug('dataset upsert complete', { datasetId: galaxyDatasetId, state: galaxyDataset.state })
      return
    }

    const { data: datasetRow, error: datasetError } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('datasets')
          .insert({
            owner_id: ownerId,
            history_id: historyId,
            storage_object_id: storageObjectId,
            storage_path: storagePath,
            uuid: galaxyDataset.uuid,
            galaxy_id: galaxyDatasetId,
            dataset_name: galaxyDataset.name,
            galaxy_metadata: {
              extension: galaxyDataset.extension,
              data_lines: galaxyDataset.metadata_data_lines || 0,
              misc_blurb: galaxyDataset.misc_blurb || undefined,
              peek: galaxyDataset.peek || undefined,
            },
          })
          .select('id')
          .single(),
      catch: error =>
        new SyncOutputError({
          message: `Failed to insert dataset: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })

    if (datasetError) {
      return yield* Effect.fail(
        new SyncOutputError({ message: `Insert dataset failed: ${datasetError.message}` }),
      )
    }

    const { error: outputInsertError } = yield* Effect.tryPromise({
      try: () =>
        supabase
          .schema('galaxy')
          .from('analysis_outputs')
          .insert({
            analysis_id: analysisId,
            dataset_id: datasetRow!.id,
            job_id: jobId,
            state: galaxyDataset.state,
          }),
      catch: error =>
        new SyncOutputError({
          message: `Failed to insert analysis output: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })

    if (outputInsertError) {
      return yield* Effect.fail(
        new SyncOutputError({ message: `Failed to insert analysis output: ${outputInsertError.message}` }),
      )
    }

    yield* Effect.logDebug('dataset upsert complete', { datasetId: galaxyDatasetId, state: galaxyDataset.state })
  }).pipe(
    Effect.annotateLogs({
      analysisId: String(analysisId),
      ownerId,
      galaxyInvocationId: null,
      historyId: String(historyId),
      jobId: String(jobId),
      datasetId: galaxyDatasetId,
    }),
  )
}
