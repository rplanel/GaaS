import process from 'node:process'
import {
  addImports,
  addImportsDir,
  addServerHandler,
  addServerImportsDir,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  installModule,
  logger,
} from '@nuxt/kit'
import { defu } from 'defu'
import * as logOptions from './log-options'
import { setupResultsViews } from './results-views'
import { GALAXY_CACHE_MOUNT } from './runtime/server/utils/galaxyCacheMount'

const log = logger.withTag('nuxt-galaxy')
export type { EncodedGalaxyWorkflowParameter, WorkflowParametersModel } from './runtime/app/composables/galaxy/types'
export type { StartAnalysisRequest } from './runtime/app/composables/useStartAnalysis'
export type { UsageStatisticsRange, UsageStatisticsRequest } from './runtime/app/queries/db/usageStatistics'
export type { DatasetBlob } from './runtime/app/queries/supabase/datasetsBlob'
export * from './runtime/app/utils/errors'
export type { ResultsViewKey, ResultsViewMatch, ResultsViewRung, ResultsViewScope } from './runtime/app/utils/resultsViews'
export type { StartAnalysisGate } from './runtime/app/utils/startAnalysis'
export type { StartAnalysisFailure } from './runtime/app/utils/startAnalysisFailure'
export type { CompositeTypes, Database, Enums, Json, Tables, TablesInsert, TablesUpdate } from './runtime/types/database'
export * from './runtime/types/nuxt-galaxy'
export interface ModuleOptions {
  /**
   * Galaxy server URL
   * @default process.env.GALAXY_URL
   * @example 'http://localhost:9000/'
   * @type string
   * @docs https://bioblend.readthedocs.io/en/latest/api_docs/galaxy/all.html#bioblend.galaxy.GalaxyInstance
   */
  url: string

  /**
   * Galaxy API key
   * @default process.env.GALAXY_API_KEY
   * @example 'fakekey'
   * @type string
   * @docs https://bioblend.readthedocs.io/en/latest/api_docs/galaxy/all.html#bioblend.galaxy.GalaxyInstance
   */
  apiKey: string

  /**
   * Galaxy user email
   * @default process.env.GALAXY_EMAIL
   * @example 'email@example.com'
   * @type string
   * @docs https://bioblend.readthedocs.io/en/latest/api_docs/galaxy/all.html#bioblend.galaxy.GalaxyInstance
   */
  email: string

  /**
   * Database URL for the supabase instance
   * This is used to connect to the database where Galaxy data is stored.
   * @default process.env.GALAXY_DRIZZLE_DATABASE_URL
   * @example 'postgres://postgres:postgres@localhost:5432/postgres'
   * @type string
   */
  databaseUrl: string

  /**
   * Automatically run database migrations on server startup.
   * When enabled, the module will apply all pending migrations
   * before the server starts handling requests.
   *
   * For production, you may prefer running migrations manually via the CLI:
   *   npx nuxt-galaxy-migrate
   *
   * @default false
   * @type boolean
   */
  runMigrations: boolean

  /**
   * Force blob upload mode for dataset uploads.
   * When enabled, datasets are always uploaded as binary blobs directly to Galaxy
   * instead of using signed URLs (useful for Galaxy instances that cannot reach Supabase storage).
   * When undefined, the module auto-detects based on Supabase URL.
   * @default undefined
   * @type boolean | undefined
   */
  useBlobUpload?: boolean

  /**
   * Logging configuration for the module.
   * Uses evlog under the hood.
   */
  logs?: logOptions.LogOptions

  /**
   * The cache behind `GET /api/galaxy/workflows/:workflowId/revisions/:revision/description`
   * (ADR 0004, #87): tool definitions keyed by Galaxy URL, tool id and the
   * version Galaxy served. Galaxy treats a tool's version string as the
   * tool's identity, so the entry is immutable and never expires. The
   * revision itself is not cached — since #88 it is read from the stored
   * definition, which is a local query rather than a Galaxy round trip.
   *
   * The substrate is a Nitro storage mount rather than an in-process map,
   * because this package is distributed and a consumer running more than one
   * replica needs one cache behind all of them. `storage` is passed straight
   * to `nitro.storage` as the mount's options, so pointing it at Redis is
   * `{ driver: 'redis', url: '…' }`.
   */
  cache?: {
    /**
     * Whether anything is cached at all. Turning it off is the escape hatch:
     * there is no expiry and no runtime invalidation.
     * @default true
     * @type boolean
     */
    enabled?: boolean

    /**
     * Nitro storage mount options for the cache.
     * @default { driver: 'memory' }
     */
    storage?: Record<string, unknown>
  }

  /**
   * Sync lock TTL in seconds.
   * How long a sync lock remains valid before another worker can reclaim it.
   * @default 900
   * @type number
   */
  syncLockTtlSeconds?: number

  /**
   * Maximum number of analyses to sync in one scheduled task batch.
   * @default 20
   * @type number
   */
  syncBatchSize?: number

  /**
   * Maximum number of retries for transient sync failures.
   * @default 3
   * @type number
   */
  syncMaxRetries?: number

  /**
   * Base delay in milliseconds before the first retry after a transient failure.
   * @default 200
   * @type number
   */
  syncRetryBaseDelayMs?: number

  /**
   * Maximum delay in milliseconds between retries.
   * @default 2000
   * @type number
   */
  syncRetryMaxDelayMs?: number
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    // Usually the npm package name of your module
    name: 'nuxt-galaxy',
    // The key in `nuxt.config` that holds your module options
    configKey: 'galaxy',
    // Compatibility constraints
    compatibility: {
      // Semver version of supported nuxt versions
      nuxt: '>=4.0.0',
    },
  },
  moduleDependencies: {
    // No sign-in redirect options: the pages they name are the UI layer's,
    // and Nuxt concatenates a dependency's array defaults with the app's, so
    // a public page set here is one no app could remove (ADR 0009, #162).
    '@nuxtjs/supabase': {
      version: '^2.0.3',
      defaults: {
        clientOptions: {
          db: {
            schema: 'galaxy',
          },
        },
      },
    },
    // The queries under `runtime/app/queries` are Pinia Colada query
    // options, so the module installs what runs them rather than relying on
    // the UI layer to. An app that lists either module itself gets it once.
    // A `version` is checked against the app's own copy when the app lists
    // the module, and a mismatch fails the build, so it is the range an app
    // may list. `@pinia/colada-nuxt`'s is the `catalog:nuxt` one package.json
    // declares. `@pinia/nuxt`'s also takes 1.x, on Pinia 4: nothing here
    // imports `pinia`, and Pinia Colada accepts 4 (#191). An app that lists
    // neither gets the catalog's 0.11.
    '@pinia/nuxt': {
      version: '^0.11.3 || ^1.0.0',
    },
    '@pinia/colada-nuxt': {
      version: '^1.0.1',
    },
  },
  // Default configuration options for your module, can also be a function returning those
  defaults: {
    url: process.env.GALAXY_URL || 'http://localhost:9000',
    apiKey: process.env.GALAXY_API_KEY || 'fakekey',
    email: process.env.GALAXY_EMAIL || 'admin@example.org',
    databaseUrl: process.env.GALAXY_DRIZZLE_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    runMigrations: false,
    useBlobUpload: undefined,
    logs: {},
    cache: { enabled: true, storage: { driver: 'memory' } },
    syncLockTtlSeconds: 900,
    syncBatchSize: 20,
    syncMaxRetries: 3,
    syncRetryBaseDelayMs: 200,
    syncRetryMaxDelayMs: 2000,
  },

  // Shorthand sugar to register Nuxt hooks
  hooks: {
    'modules:before': function () {
      const resolver = createResolver(import.meta.url)
      // @ts-expect-error - supabase module options
      this.options.supabase = defu(this.options.supabase || {}, {
        types: resolver.resolve('./runtime/types/database.ts'),
      })
    },

  },
  // The function holding your module logic, it can be asynchronous
  async setup(moduleOptions, nuxt) {
    // We create the `experimental` object if it doesn't exist yet
    const resolver = createResolver(import.meta.url)

    const syncBatchSize = moduleOptions.syncBatchSize ?? 20
    const syncMaxRetries = moduleOptions.syncMaxRetries ?? 3
    const syncLockTtlSeconds = moduleOptions.syncLockTtlSeconds ?? 900
    const syncRetryBaseDelayMs = moduleOptions.syncRetryBaseDelayMs ?? 200
    const syncRetryMaxDelayMs = moduleOptions.syncRetryMaxDelayMs ?? 2000

    if (!(syncBatchSize > 0))
      throw new Error('syncBatchSize must be positive')
    if (!(syncMaxRetries >= 0))
      throw new Error('syncMaxRetries must be non-negative')
    if (!(syncLockTtlSeconds > 0))
      throw new Error('syncLockTtlSeconds must be positive')
    if (!(syncRetryBaseDelayMs >= 0))
      throw new Error('syncRetryBaseDelayMs must be non-negative')
    if (!(syncRetryMaxDelayMs >= syncRetryBaseDelayMs))
      throw new Error('syncRetryMaxDelayMs must be >= syncRetryBaseDelayMs')

    const _resolvedLogs = logOptions.resolveLogOptions(nuxt.options.dev, moduleOptions.logs)

    // The description endpoint's cache (#87). Mounted whatever the setting,
    // so that turning the cache off and on again is a runtime-config change
    // rather than a different Nitro build; `enabled` is what the endpoint
    // reads, and a disabled cache never touches the mount.
    const cacheEnabled = moduleOptions.cache?.enabled ?? true
    const cacheStorage = moduleOptions.cache?.storage ?? { driver: 'memory' }

    await installModule('evlog/nuxt', {
      enabled: _resolvedLogs.enabled,
      env: { service: _resolvedLogs.service },
      minLevel: _resolvedLogs.minLevel,
      pretty: _resolvedLogs.pretty,
      console: _resolvedLogs.console,
      redact: _resolvedLogs.redact,
    })

    // Also set supabase types in runtime config to ensure it's picked up
    nuxt.options.supabase = defu(nuxt.options.supabase || {}, {
      types: resolver.resolve('./runtime/types/database.ts'),
    })

    // public runtime
    // Leftmost arguments have more priority when assigning defaults.
    const runtimeConfig = nuxt.options.runtimeConfig
    nuxt.options.runtimeConfig.public.galaxy = defu(
      runtimeConfig.public.galaxy || {},
      { url: moduleOptions.url, useBlobUpload: moduleOptions.useBlobUpload },
    ) as typeof nuxt.options.runtimeConfig.public.galaxy

    // Add supabase URL to public runtime config for server-side detection
    nuxt.options.runtimeConfig.public.supabaseUrl = runtimeConfig.public.supabaseUrl || process.env.SUPABASE_URL || ''

    // Private runtime

    // Leftmost arguments have more priority when assigning defaults.
    nuxt.options.runtimeConfig.galaxy = defu(
      runtimeConfig.galaxy || {},
      {
        apiKey: moduleOptions.apiKey,
        email: moduleOptions.email,
        drizzle: {
          databaseUrl: moduleOptions.databaseUrl,
        },
        logs: _resolvedLogs,
        cache: { enabled: cacheEnabled },
        sync: {
          lockTtlSeconds: syncLockTtlSeconds,
          batchSize: syncBatchSize,
          maxRetries: syncMaxRetries,
          retryBaseDelayMs: syncRetryBaseDelayMs,
          retryMaxDelayMs: syncRetryMaxDelayMs,
        },
      },
    ) as typeof nuxt.options.runtimeConfig.galaxy

    // Make sure url and key are set
    if (!nuxt.options.runtimeConfig.public.galaxy.url) {
      log.warn('Missing galaxy url, set it either in `nuxt.config.js` or via env variable')
    }
    if (!nuxt.options.runtimeConfig.galaxy.apiKey) {
      log.warn('Missing galaxy api key, set it either in `nuxt.config.js` or via env variable')
    }
    if (!nuxt.options.runtimeConfig.galaxy.email) {
      log.warn('Missing galaxy email, set it either in `nuxt.config.js` or via env variable')
    }
    if (!nuxt.options.runtimeConfig.galaxy.drizzle.databaseUrl) {
      log.warn('Missing galaxy database url, set it either in `nuxt.config.js` or via env variable')
    }

    // From the runtime directory

    const composables = [
      { name: 'useUserRole', path: './runtime/app/composables/useUserRole' },
      { name: 'useErrorStatus', path: './runtime/app/composables/useErrorStatus' },
      { name: 'useErrorMessage', path: './runtime/app/composables/useErrorMessage' },
      { name: 'useGalaxyHint', path: './runtime/app/composables/galaxy/useGalaxyHint' },
      // one composable for a workflow revision and its tools (#87); it
      // replaced `useGalaxyTool` and `useGalaxyWorkflow`, which used raw
      // `$fetch` and so deduplicated nothing
      { name: 'useGalaxyWorkflowDescription', path: './runtime/app/composables/galaxy/useGalaxyWorkflowDescription' },
      { name: 'describeUnavailableTool', path: './runtime/app/composables/galaxy/useGalaxyWorkflowDescription' },
      { name: 'describeUnconnectedDatasetInputs', path: './runtime/app/composables/galaxy/useGalaxyWorkflowDescription' },
      // Galaxy's own naming of an input step, which the graph labels a node
      // with and `describedInputsOf` labels the datamap with (#89). Shared so
      // that the two cannot disagree about what a step is called; registered
      // here because the graph reads it from a layer that cannot import
      // `runtime/shared/` by path.
      { name: 'inputStepLabel', path: './runtime/shared/stepLabel' },
      { name: 'isInputStep', path: './runtime/shared/stepLabel' },
      // The word the Unknown workflow travels under, which the usage
      // endpoints parse and a UI's usage pages compare a selection against
      // (#169); registered for the same reason.
      { name: 'UNKNOWN_WORKFLOW_SELECTION', path: './runtime/shared/unknownWorkflow' },
      // Parameter encoding and decoding, one format tested as a round trip
      // (#163): what an analysis is started with and what copying one, or
      // its jobs panel, reads back. `isParameterGroupValue` tells a group's
      // bag from a scalar; the rest stay unregistered. The widgets read the
      // bag through `parameterGroupValue` in `runtime/app/utils` (#166).
      { name: 'useGalaxyEncodeParameters', path: './runtime/app/composables/galaxy/useGalaxyEncodeParameters' },
      { name: 'useGalaxyDecodeParameters', path: './runtime/app/composables/galaxy/useGalaxyDecodeParameters' },
      { name: 'isParameterGroupValue', path: './runtime/app/composables/galaxy/parameterValue' },
      // Starting an analysis (#163): the request, its encoding and the
      // description of a refused start. The rules for what may be sent and
      // the gate that refuses it first are in `runtime/app/utils/startAnalysis`.
      { name: 'useStartAnalysis', path: './runtime/app/composables/useStartAnalysis' },
      { name: 'useUploadFileToStorage', path: './runtime/app/composables/useUploadFileToStorage' },
      { name: 'useDiskUsage', path: './runtime/app/composables/useDiskUsage' },
      { name: 'useSupabaseRealtime', path: './runtime/app/composables/useSupabaseRealtime' },
      { name: 'useDatasetSignedUrl', path: './runtime/app/composables/useDatasetSignedUrl' },
      { name: 'useParse', path: './runtime/app/composables/parser/useParse' },
      { name: 'useParseCsv', path: './runtime/app/composables/parser/useParseCsv' },
      { name: 'useParseTsv', path: './runtime/app/composables/parser/useParseTsv' },
      // The results view that applies to a workflow (ADR 0003), looked up in
      // the registry `setupResultsViews` builds below.
      { name: 'useResultsView', path: './runtime/app/composables/useResultsView' },

    ]

    for (const composable of composables) {
      addImports({
        name: composable.name, // name of the composable to be used
        as: composable.name,
        from: resolver.resolve(composable.path), // path of composable
      })
    }

    // Query imports from pinia-colada
    addImportsDir(resolver.resolve('./runtime/app/queries'))

    // addImportsDir(resolver.resolve('./runtime/app/composables'))
    // addImportsDir(resolver.resolve('./runtime/app/composables/galaxy'))
    addImportsDir(resolver.resolve('./runtime/app/utils'))

    // Results views (ADR 0003): every layer's `app/workflows/` is scanned
    // into the registry the results page imports. They are here, not in the
    // UI layer that hosts that page, so that an app's views outlive a swap of
    // that layer (ADR 0009). A view needs an import for its props type, since
    // Vue resolves a `defineProps` type only through an import in the file.
    // The alias is an absolute path into this module, so it resolves in any
    // app that installs it, even one that reaches `nuxt-galaxy` only through
    // a layer under a strict pnpm install, where the bare package name does
    // not resolve from the app's own files (the gap #160 hit for the bins).
    await setupResultsViews(nuxt)
    nuxt.options.alias['#nuxt-galaxy'] = resolver.resolve('./runtime/types/nuxt-galaxy')

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerImportsDir(resolver.resolve('./runtime/server/db'))
    // Nitro tasks
    nuxt.options.nitro = defu(nuxt.options.nitro || {}, {
      storage: { [GALAXY_CACHE_MOUNT]: cacheStorage },
      experimental: { tasks: true },
      scheduledTasks: { '*/30 * * * * *': ['galaxy:sync-analyses'] },
      tasks: {
        'galaxy:sync-analyses': {
          handler: resolver.resolve('./runtime/server/tasks/galaxy/sync-analyses'),
          description: 'Sync pending Galaxy analyses to Supabase',
        },
      },
    })

    // Galaxy
    // Who may call the proxies below (#99): `galaxyAccess.ts` holds each
    // route's level and answers `admin` for one it has never heard of.
    addServerHandler({
      handler: resolver.resolve('./runtime/server/middleware/galaxyGuard'),
      middleware: true,
    })
    addServerHandler({
      route: '/api/galaxy/instance',
      handler: resolver.resolve('./runtime/server/api/galaxy/instance.get'),

    })
    addServerHandler({
      route: '/api/galaxy/health',
      handler: resolver.resolve('./runtime/server/api/galaxy/health.get'),
      method: 'get',
    })
    addServerHandler({
      route: '/api/galaxy/histories',
      handler: resolver.resolve('./runtime/server/api/galaxy/histories.get'),
      method: 'get',
    })
    addServerHandler({
      route: '/api/galaxy/workflows',
      handler: resolver.resolve('./runtime/server/api/galaxy/workflows.get'),
      method: 'get',
    })

    addServerHandler({
      route: '/api/probe',
      handler: resolver.resolve('./runtime/server/api/probe.get'),
      method: 'get',
    })
    // workflows
    addServerHandler({
      route: '/api/galaxy/workflows/:workflowId/versions',
      handler: resolver.resolve('./runtime/server/api/galaxy/workflows/[workflowId]/versions.get'),
      method: 'get',
    })
    // the tool check of one revision, for the publish dialog (#75)
    addServerHandler({
      route: '/api/galaxy/workflows/:workflowId/revisions/:revision/tools',
      handler: resolver.resolve('./runtime/server/api/galaxy/workflows/[workflowId]/revisions/[revision]/tools.get'),
      method: 'get',
    })
    // one revision described in one call — steps, inputs, tool definitions
    // and the tools that are unusable — for the invoke form and the analysis
    // panel (#87)
    addServerHandler({
      route: '/api/galaxy/workflows/:workflowId/revisions/:revision/description',
      handler: resolver.resolve('./runtime/server/api/galaxy/workflows/[workflowId]/revisions/[revision]/description.get'),
      method: 'get',
    })

    // db
    addServerHandler({
      route: '/api/db/analyses',
      handler: resolver.resolve('./runtime/server/api/db/analyses.post'),
      method: 'post',
    })

    addServerHandler({
      route: '/api/db/analyses/monitoring',
      handler: resolver.resolve('./runtime/server/api/db/analyses/monitoring.get'),
      method: 'get',
    })

    addServerHandler({
      route: '/api/db/analyses/monitoring/admin',
      handler: resolver.resolve('./runtime/server/api/db/analyses/monitoring/admin.get'),
      method: 'get',
    })

    addServerHandler({
      route: '/api/db/analyses/:analysisId',
      handler: resolver.resolve('./runtime/server/api/db/analyses/[analysisId].delete'),
      method: 'delete',
    })

    addServerHandler({
      route: '/api/db/analyses/:id/sync',
      handler: resolver.resolve('./runtime/server/api/db/analyses/[id]/sync.post'),
      method: 'post',
    })

    addServerHandler({
      route: '/api/db/workflows',
      handler: resolver.resolve('./runtime/server/api/db/workflows.post'),
      method: 'post',
    })
    // one version row (ADR 0004): retire it or make it active again (#71),
    // or delete it while no analysis references it (#72)
    addServerHandler({
      route: '/api/db/workflows/:workflowId',
      handler: resolver.resolve('./runtime/server/api/db/workflows/[workflowId].patch'),
      method: 'patch',
    })
    addServerHandler({
      route: '/api/db/workflows/:workflowId',
      handler: resolver.resolve('./runtime/server/api/db/workflows/[workflowId].delete'),
      method: 'delete',
    })
    // the state of one version, read live from Galaxy for the admin page (#76)
    addServerHandler({
      route: '/api/db/workflows/:workflowId/state',
      handler: resolver.resolve('./runtime/server/api/db/workflows/[workflowId]/state.get'),
      method: 'get',
    })

    /*********************/
    // Add server plugin
    /*********************/
    addServerPlugin(resolver.resolve('./runtime/server/plugins/galaxy.server'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/evlog.server'))

    // Optionally run database migrations on server startup
    if (moduleOptions.runMigrations) {
      addServerPlugin(resolver.resolve('./runtime/server/plugins/migrations.server'))
      log.info('Database migrations will run on server startup')
    }
  },
})

declare module '@nuxt/schema' {
  interface PublicRuntimeConfig {
    galaxy: {
      url: string
      useBlobUpload?: boolean
    }
  }
  interface RuntimeConfig {
    galaxy: {
      apiKey: string
      email: string
      drizzle: {
        databaseUrl: string
      }
      logs: logOptions.ResolvedLogOptions
      cache: {
        enabled: boolean
      }
      sync: {
        lockTtlSeconds: number
        batchSize: number
        maxRetries: number
        retryBaseDelayMs: number
        retryMaxDelayMs: number
      }
    }
  }
}
