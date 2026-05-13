import { getVersionEffect } from 'blendtype'
import { Data, Effect } from 'effect'
import { useGalaxyLayer } from './galaxy'
import { getActiveMaintenanceEffect } from './grizzle/maintenance'

export interface GalaxyHealthStatus {
  status: 'up' | 'down' | 'maintenance'
  maintenance: {
    message: string
    startAt: string
    endAt: string
  } | null
}

export class CheckGalaxyHealthError extends Data.TaggedError('CheckGalaxyHealthError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Checks the current Galaxy health status including maintenance windows and connectivity.
 */
export function checkGalaxyHealthEffect() {
  return Effect.gen(function* () {
    const activeMaintenance = yield* getActiveMaintenanceEffect()
    const currentMaintenance = activeMaintenance[0]

    if (currentMaintenance) {
      return {
        status: 'maintenance' as const,
        maintenance: {
          message: currentMaintenance.message,
          startAt: currentMaintenance.startAt.toISOString(),
          endAt: currentMaintenance.endAt.toISOString(),
        },
      }
    }

    const version = yield* getVersionEffect.pipe(
      Effect.provide(useGalaxyLayer()),
      Effect.catchAll(() => Effect.succeed(null)),
    )

    if (!version) {
      return {
        status: 'down' as const,
        maintenance: null,
      }
    }

    return {
      status: 'up' as const,
      maintenance: null,
    }
  })
}
