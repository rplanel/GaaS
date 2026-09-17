import { defineErrorCatalog } from 'evlog'

/**
 * Typed errors for nuxt-galaxy.
 *
 * Seeded by `evlog init` from errors this project already repeats across
 * files. Fill in `why` and `fix` — they are what turn a stack trace into
 * something a reader, or an agent, can act on — then replace the inline
 * `createError` calls with `nuxtGalaxyErrors.<KEY>()`.
 */
export const nuxtGalaxyErrors = defineErrorCatalog('nuxt-galaxy', {
  /** Currently written inline in src/runtime/server/api/db/analyses/[analysisId].delete.ts, src/runtime/server/api/db/analyses/monitoring.get.ts, src/runtime/server/api/db/analyses/monitoring/admin.get.ts */
  E_401: {
    status: 401,
    message: 'Unauthorized',
    why: 'The request is not authenticated or the authenticated user session is invalid',
    fix: 'Sign in with a valid account and retry the request',
  },
  /** Currently written inline in src/runtime/server/api/db/analyses/[analysisId].delete.ts, src/runtime/server/api/db/analyses/monitoring.get.ts, src/runtime/server/api/db/analyses/monitoring/admin.get.ts, … */
  E_500: {
    status: 500,
    message: 'Internal Server Error',
    why: 'An unexpected error occurred while processing the request',
    fix: 'Check the server logs for the request trace and retry; contact support if the error persists',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'nuxt-galaxy': typeof nuxtGalaxyErrors
  }
}
