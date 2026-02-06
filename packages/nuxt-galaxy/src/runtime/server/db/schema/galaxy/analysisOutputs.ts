import type { DatasetState } from 'blendtype'
import { sql } from 'drizzle-orm'
import { index, integer, pgPolicy, primaryKey, serial, unique } from 'drizzle-orm/pg-core'
import { authenticatedRole } from 'drizzle-orm/supabase'
import { datasetStateEnum, galaxy } from '../galaxy'
import { analyses } from './analyses'
import { datasets } from './datasets'
import { jobs } from './jobs'
import { tags } from './tags'

export const analysisOutputs = galaxy.table(
  'analysis_outputs',
  {
    id: serial('id').primaryKey(),
    state: datasetStateEnum('state').$type<DatasetState>().notNull(),
    datasetId: integer('dataset_id').references(() => datasets.id, { onDelete: 'cascade' }).notNull(),
    analysisId: integer('analysis_id').references(() => analyses.id, { onDelete: 'cascade' }).notNull(),
    jobId: integer('job_id').references(() => jobs.id).notNull(),
  },
  table => [
    unique().on(table.datasetId, table.jobId),
    index().on(table.datasetId),
    index().on(table.analysisId),
    index().on(table.jobId),
    pgPolicy('User can see their own output data', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.datasetId} IN (SELECT ${datasets.id} FROM ${datasets} WHERE ${datasets.ownerId} = (SELECT auth.uid()))`,
    }),
    pgPolicy('Users can insert output datasets', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`${table.datasetId} IN (SELECT ${datasets.id} FROM ${datasets} WHERE ${datasets.ownerId} = (SELECT auth.uid()))`,
    }),
  ],
)

/**
 * outputAnalysis tags
 */

export const analysisOutputsToTags = galaxy.table('analysis_outputs_to_tags', {
  analysisOutputId: integer('analysis_output_id')
    .notNull()
    .references(() => analysisOutputs.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id),
}, t => ({
  pk: primaryKey({ columns: [t.analysisOutputId, t.tagId] }),
}))
