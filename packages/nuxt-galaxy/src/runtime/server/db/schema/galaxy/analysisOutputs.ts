import type { DatasetState } from 'blendtype'
import { relations } from 'drizzle-orm'
import { index, integer, primaryKey, serial, unique } from 'drizzle-orm/pg-core'
import { datasetStateEnum, galaxy } from '../galaxy'
import { analyses } from './analyses'
import { datasets } from './datasets'
import { jobs } from './jobs'
import { tags } from './tags'

export const analysisOutputs = galaxy.table('analysis_outputs', {
  id: serial('id').primaryKey(),
  state: datasetStateEnum('state').$type<DatasetState>().notNull(),
  datasetId: integer('dataset_id').references(() => datasets.id, { onDelete: 'cascade' }).notNull(),
  analysisId: integer('analysis_id').references(() => analyses.id, { onDelete: 'cascade' }).notNull(),
  jobId: integer('job_id').references(() => jobs.id).notNull(),
}, table => [
  unique().on(table.datasetId, table.jobId),
  index().on(table.datasetId),
  index().on(table.analysisId),
  index().on(table.jobId),
])

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

export const analysisOutputsRelations = relations(analysisOutputs, ({ one, many }) => {
  return {
    dataset: one(datasets, {
      fields: [analysisOutputs.datasetId],
      references: [datasets.id],
    }),
    analysis: one(analyses, {
      fields: [analysisOutputs.analysisId],
      references: [analyses.id],
    }),
    job: one(jobs, {
      fields: [analysisOutputs.jobId],
      references: [jobs.id],
    }),
    analysisOutputsTags: many(analysisOutputsToTags),
  }
})
