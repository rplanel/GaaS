import process from 'node:process'
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { Context, Layer } from 'effect'
import postgres from 'postgres'
import * as analyses from '../db/schema/galaxy/analyses'
import * as analysisInputs from '../db/schema/galaxy/analysisInputs.js'
import * as analysisOutputs from '../db/schema/galaxy/analysisOutputs.js'
import * as datasets from '../db/schema/galaxy/datasets'
import * as histories from '../db/schema/galaxy/histories'
import * as instances from '../db/schema/galaxy/instances'
import * as jobs from '../db/schema/galaxy/jobs'
import * as rolePermissions from '../db/schema/galaxy/rolePermissions'
import * as roles from '../db/schema/galaxy/roles'
import * as tags from '../db/schema/galaxy/tags.js'
import * as uploadedDatasets from '../db/schema/galaxy/uploadedDatasets'
import * as userRoles from '../db/schema/galaxy/userRoles'
import * as users from '../db/schema/galaxy/users.js'
import * as workflows from '../db/schema/galaxy/workflows.js'

export { and, eq, or, sql } from 'drizzle-orm'

config({ path: '.env' })

const client = postgres(process.env.GALAXY_DRIZZLE_DATABASE_URL!)

export function useDrizzle() {
  return drizzle(client, {
    schema: {
      ...histories,
      ...analyses,
      ...datasets,
      ...instances,
      ...users,
      ...tags,
      ...workflows,
      ...analysisInputs,
      ...analysisOutputs,
      ...uploadedDatasets,
      ...jobs,
      ...rolePermissions,
      ...roles,
      ...userRoles,
    },
  })
}

export class Drizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<
  Drizzle,
  ReturnType<typeof drizzle>
>() {
  static readonly Live = Layer.succeed(
    Drizzle,
    drizzle(client, {
      schema: {
        ...histories,
        ...analyses,
        ...datasets,
        ...instances,
        ...users,
        ...tags,
        ...workflows,
        ...analysisInputs,
        ...analysisOutputs,
        ...uploadedDatasets,
        ...jobs,
        ...rolePermissions,
        ...roles,
        ...userRoles,
      },
    }),
  )
}
