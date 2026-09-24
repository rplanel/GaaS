import type { VersionState } from '../../../types/nuxt-galaxy'
import { defineQueryOptions } from '@pinia/colada'

/**
 * Each version's state caches on its own, for the page's life: the admin
 * workflows page asks once per version it lists and the badge beside the
 * version offers a refetch, so a state is read again only when someone asks.
 */
export const VERSION_STATE_QUERY_KEYS = {
  root: ['version-state'] as const,
  byId: (id: number) => [...VERSION_STATE_QUERY_KEYS.root, id] as const,
}

/**
 * The state of one version (ADR 0004, #76), as `GET /api/db/workflows/:id/state`
 * reads it live from Galaxy: runnable, tools missing, missing in Galaxy or
 * revision mismatch. A failed read rejects, and the badge says the version
 * could not be checked rather than guessing a state.
 */
export const versionStateQuery = defineQueryOptions(({ id }: { id: number }) => ({
  key: VERSION_STATE_QUERY_KEYS.byId(id),
  query: () => $fetch<VersionState>(`/api/db/workflows/${id}/state`),
}))
