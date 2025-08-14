import process from 'node:process'

import {
  addImports,
  addImportsDir,
  addServerHandler,
  addServerImportsDir,
  addServerPlugin,
  addTemplate,
  createResolver,
  defineNuxtModule,
  installModule,
  logger,
} from '@nuxt/kit'
import { defu } from 'defu'

const log = logger.withTag('nuxt-galaxy')
export * from './runtime/app/utils/errors'
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
      nuxt: '>=3.0.0',
    },
  },
  // Default configuration options for your module, can also be a function returning those
  defaults: {
    url: process.env.GALAXY_URL || 'http://localhost:9000',
    apiKey: process.env.GALAXY_API_KEY || 'fakekey',
    email: process.env.GALAXY_EMAIL || 'admin@example.org',
    databaseUrl: process.env.GALAXY_DRIZZLE_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',

  },
  // Shorthand sugar to register Nuxt hooks
  hooks: {},
  // The function holding your module logic, it can be asynchronous
  async setup(moduleOptions, nuxt) {
    // We create the `experimental` object if it doesn't exist yet
    const resolver = createResolver(import.meta.url)

    // public runtime
    // Leftmost arguments have more priority when assigning defaults.
    const runtimeConfig = nuxt.options.runtimeConfig
    nuxt.options.runtimeConfig.public.galaxy = defu(
      runtimeConfig.public.galaxy || {},
      { url: moduleOptions.url },
    )

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
      },
    )

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

    // Install supabase module

    await installModule('@nuxtjs/supabase', {
      // module configuration
      redirectOptions: {
        login: '/login',
        callback: '/confirm',
        include: [],
        exclude: ['/', '/login', '/signup', '/confirm'],
        cookieRedirect: true,
      },
      clientOptions: {
        db: {
          schema: 'galaxy',
        },
      },

      types: './runtime/types/database.ts',
    }, nuxt)

    // Install nuxt content module
    await installModule('@nuxt/content', { }, nuxt)

    // From the runtime directory

    const composables = [
      { name: 'useUserRole', path: './runtime/app/composables/useUserRole' },
      { name: 'useFileSize', path: './runtime/app/composables/useFileSize' },
      { name: 'useErrorStatus', path: './runtime/app/composables/useErrorStatus' },
      { name: 'useErrorMessage', path: './runtime/app/composables/useErrorMessage' },
      { name: 'useAnalysisDetails', path: './runtime/app/composables/useAnalysisDetails' },
      { name: 'useGalaxyHint', path: './runtime/app/composables/galaxy/useGalaxyHint' },
      { name: 'useGalaxyTool', path: './runtime/app/composables/galaxy/useGalaxyTool' },
      { name: 'useGalaxyWorkflow', path: './runtime/app/composables/galaxy/useGalaxyWorkflow' },
      { name: 'useUploadFileToStorage', path: './runtime/app/composables/useUploadFileToStorage' },
      { name: 'useDiskUsage', path: './runtime/app/composables/useDiskUsage' },
      { name: 'useSupabaseRealtime', path: './runtime/app/composables/useSupabaseRealtime' },
      { name: 'useDatasetSignedUrl', path: './runtime/app/composables/useDatasetSignedUrl' },
      { name: 'useDownloadDataset', path: './runtime/app/composables/useDownloadDataset' },

    ]

    for (const composable of composables) {
      addImports({
        name: composable.name, // name of the composable to be used
        as: composable.name,
        from: resolver.resolve(composable.path), // path of composable
      })
    }

    // addImportsDir(resolver.resolve('./runtime/app/composables'))
    // addImportsDir(resolver.resolve('./runtime/app/composables/galaxy'))
    addImportsDir(resolver.resolve('./runtime/app/utils'))

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerImportsDir(resolver.resolve('./runtime/server/db'))
    // Galaxy
    addServerHandler({
      route: '/sync',
      handler: resolver.resolve('./runtime/server/routes/sync'),
      method: 'get',
    })
    addServerHandler({
      route: '/api/galaxy/instance',
      handler: resolver.resolve('./runtime/server/api/galaxy/instance.get'),

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
      route: '/api/galaxy/workflows/:workflowId',
      handler: resolver.resolve('./runtime/server/api/galaxy/workflows/[workflowId].get'),
      method: 'get',
    })

    // tools
    addServerHandler({
      route: '/api/galaxy/tools/:toolId/:toolVersion',
      handler: resolver.resolve('./runtime/server/api/galaxy/tools/[toolId]/[toolVersion].get'),
      method: 'get',
    })

    // db
    addServerHandler({
      route: '/api/db/analyses',
      handler: resolver.resolve('./runtime/server/api/db/analyses.post'),
      method: 'post',
    })

    addServerHandler({
      route: '/api/db/analyses/:analysisId',
      handler: resolver.resolve('./runtime/server/api/db/analyses/[analysisId].delete'),
      method: 'delete',
    })

    addServerHandler({
      route: '/api/db/workflows',
      handler: resolver.resolve('./runtime/server/api/db/workflows.post'),
      method: 'post',
    })

    /*********************/
    // Add server plugin
    /*********************/
    addServerPlugin(resolver.resolve('./runtime/server/plugins/galaxy.server'))

    // Types

    addTemplate({
      filename: 'types/nuxt-galaxy.d.ts',
      getContents: () => {
        return `// Generated by nuxt/galaxy module
    
import * as GalaxyTypes from '${resolver.resolve('./runtime/types/nuxt-galaxy')}'

export { GalaxyTypes }
`
      },
    })

    nuxt.hook('prepare:types', (options) => {
      options.references.push({ path: resolver.resolve(nuxt.options.buildDir, 'types/nuxt-galaxy.d.ts') })
    })

    addTemplate({
      filename: 'types/database.d.ts',
      getContents: () => {
        return `// Generated by nuxt/galaxy module
import * as SupabaseTypes from '${resolver.resolve('./runtime/types/database')}'

export { SupabaseTypes }
`
      },
    })

    nuxt.hook('prepare:types', (options) => {
      options.references.push({ path: resolver.resolve(nuxt.options.buildDir, 'types/database.d.ts') })
    })

    // addTemplate({
    //   filename: 'types/nuxt-galaxy.d.ts',
    //   src: resolver.resolve('./runtime/types/nuxt-galaxy.d.ts'),
    //   // src: resolver.resolve('./runtime/types/nuxt-galaxy.ts'),
    // })

    // addTemplate({
    //   filename: 'types/database.d.ts',
    //   src: resolver.resolve('./runtime/types/database.d.ts'),
    //   // src: resolver.resolve('./runtime/types/database.ts'),
    // })

    // nuxt.hook('prepare:types', (opts) => {
    //   opts.references.push({types})

    // })

    // nuxt.options.alias['#galaxy'] = resolver.resolve('./runtime')
  },
})

// declare module '@nuxt/schema' {

//   interface PublicRuntimeConfig {
//     galaxy: {
//       url: string
//     }
//   }
//   interface RuntimeConfig {
//     galaxy: {
//       apiKey: string
//       email: string
//       localDocker: boolean
//     }
//   }
// }
