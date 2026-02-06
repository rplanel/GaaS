import type { DatasetState } from 'blendtype'
import { sql } from 'drizzle-orm'
import { index, integer, pgPolicy, serial } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { datasetStateEnum, galaxy } from '../galaxy'
import { analyses } from './analyses'
import { datasets } from './datasets'

export const analysisInputs = galaxy.table(
  'analysis_inputs',
  {
    id: serial('id').primaryKey(),
    state: datasetStateEnum('state').$type<DatasetState>().notNull(),
    datasetId: integer('dataset_id').references(() => datasets.id, { onDelete: 'cascade' }).notNull().unique(),
    analysisId: integer('analysis_id').references(() => analyses.id, { onDelete: 'cascade' }).notNull(),
  },
  table => [
    index().on(table.datasetId),
    index().on(table.analysisId),
    pgPolicy('User can see their own input data', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.datasetId} IN (SELECT ${datasets.id} FROM ${datasets} WHERE ${datasets.ownerId} = (SELECT auth.uid()))`,
    }),
    pgPolicy('Users can insert input datasets', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`${table.datasetId} IN (SELECT ${datasets.id} FROM ${datasets} WHERE ${datasets.ownerId} = (SELECT auth.uid()))`,
    }),
  ],
)
