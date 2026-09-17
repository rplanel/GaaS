import type * as bt from 'blendtype'
import type { Layer } from 'effect'
import { useRuntimeConfig } from '#imports'
import { Effect } from 'effect'
import { createRequestLogger } from 'evlog'
import { defineTask } from 'nitropack/runtime/task'
import { runTaskEffect } from '../../utils/evlog-effect'
import { useGalaxyLayer } from '../../utils/galaxy'
import { createServiceRoleSupabaseClient } from '../../utils/grizzle/supabase'
import { syncAnalysisEffect } from '../../utils/grizzle/sync/analysis'

// Sync trace fields: see .planning/LOGGING-SPEC.md ## Sync trace field allowlist

// This scheduled task is the sole mutator of Galaxy sync state.
// On-demand sync requests must enqueue `galaxy:sync-analyses` via runTask
// rather than invoking syncAnalysisEffect directly, so lock semantics and
// logging remain centralized here.

export default defineTask({
  meta: {
    name: 'galaxy:sync-analyses',
    description: 'Sync pending Galaxy analyses to Supabase',
  },
  run: async ({ payload }) => {
    const taskLog = createRequestLogger({
      operation: 'galaxy:sync-analyses',
      requestId: crypto.randomUUID(),
    } as Parameters<typeof createRequestLogger>[0])

    const start = Date.now()
    const result = await runTaskEffect(taskLog, Effect.gen(function* () {
      const analysisId = (payload as { analysisId?: number } | undefined)?.analysisId
      yield* Effect.logInfo('task started', { analysisId: analysisId ?? null })
      const supabase = yield* createServiceRoleSupabaseClient()
      const galaxyLayer = useGalaxyLayer()

      const syncConfig = useRuntimeConfig().galaxy.sync
      const pageSize = syncConfig.batchSize

      if (analysisId) {
        yield* Effect.logInfo('syncing single analysis', { analysisId })
        const { data, error } = yield* Effect.tryPromise(() =>
          supabase.schema('galaxy').from('analyses').select('id, owner_id').eq('id', analysisId).single(),
        )
        if (error || !data) {
          const message = error?.message ?? 'Analysis not found'
          yield* Effect.logError('analysis not found or error', { analysisId, message })
          return { synced: 0, failed: 1, skipped: 0, errors: [{ analysisId, message: 'Analysis not found' }] }
        }
        const outcome = yield* syncAnalysisEffect(data.id, data.owner_id, supabase, galaxyLayer as Layer.Layer<bt.GalaxyFetch>, syncConfig).pipe(
          Effect.tapError(e => Effect.logError('analysis failed', { analysisId, message: e?.message ?? String(e) })),
          Effect.match({
            onFailure: e => ({ status: 'failed' as const, message: e?.message ?? String(e) }),
            onSuccess: () => ({ status: 'synced' as const, message: null }),
          }),
        )
        if (outcome.status === 'synced') {
          return { synced: 1, failed: 0, skipped: 0, errors: [] }
        }
        return {
          synced: 0,
          failed: 1,
          skipped: 0,
          errors: [{ analysisId, message: outcome.message.slice(0, 500) }],
        }
      }

      let synced = 0
      let failed = 0
      const errors: { analysisId: number | null, message: string }[] = []
      let offset = 0
      let page
      do {
        page = yield* Effect.tryPromise(() =>
          supabase
            .schema('galaxy')
            .from('analyses')
            .select('id, owner_id')
            .or('is_sync.eq.false,state.in.(new,requires_materialization,ready,scheduled,cancelling)')
            .or(`next_sync_at.is.null,next_sync_at.lte.${new Date().toISOString()}`)
            .order('next_sync_at', { ascending: true })
            .range(offset, offset + pageSize - 1),
        )
        yield* Effect.logDebug('page query', {
          offset,
          pageSize,
          rowCount: page.data?.length ?? 0,
          errorMessage: page.error?.message ?? null,
        })
        if (page.error) {
          errors.push({ analysisId: null, message: page.error.message.slice(0, 500) })
          return { synced: 0, failed: 1, skipped: 0, errors }
        }
        for (const row of page.data || []) {
          const outcome = yield* syncAnalysisEffect(row.id, row.owner_id, supabase, galaxyLayer as Layer.Layer<bt.GalaxyFetch>, syncConfig).pipe(
            Effect.tapError(e => Effect.logError('analysis failed', { analysisId: row.id, message: e?.message ?? String(e) })),
            Effect.match({
              onFailure: e => ({ status: 'failed' as const, message: e?.message ?? String(e) }),
              onSuccess: () => ({ status: 'synced' as const, message: null }),
            }),
          )
          if (outcome.status === 'synced') {
            synced++
          }
          else {
            failed++
            errors.push({ analysisId: row.id, message: outcome.message.slice(0, 500) })
          }
        }
        offset += pageSize
      } while (page.data && page.data.length === pageSize)

      yield* Effect.logInfo('batch finished', { synced, failed })
      return { synced, failed, skipped: 0, errors }
    }).pipe(
      Effect.tap(taskResult => Effect.logInfo('task result', taskResult)),
      Effect.catchAll(error =>
        Effect.logError('task error', { message: String(error).slice(0, 500) }).pipe(
          Effect.as({ synced: 0, failed: 1, skipped: 0, errors: [{ analysisId: null, message: String(error).slice(0, 500) }] }),
        ),
      ),
    ))

    const durationMs = Date.now() - start
    taskLog.emit({
      status: result.failed > 0 ? 500 : 200,
      synced: result.synced,
      failed: result.failed,
      skipped: result.skipped,
      durationMs,
      errors: result.errors,
    })
    return { result }
  },
})
