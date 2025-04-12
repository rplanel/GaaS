import type { JobState } from 'blendtype'
import { relations } from 'drizzle-orm'
import { boolean, index, integer, serial, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { users as owners } from '../auth/users'
import { galaxy, jobStateEnum } from '../galaxy'
import { analyses } from './analyses'
import { analysisOutputs } from './analysisOutputs'

export const jobs = galaxy.table('jobs', {
  id: serial('id').primaryKey(),
  state: jobStateEnum('state').$type<JobState>().notNull(),
  toolId: varchar('tool_id', { length: 256 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  exitCode: integer('exit_code'),
  stdout: text('stdout'),
  stderr: text('stderr'),
  ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
  galaxyId: varchar('galaxy_id', { length: 256 }).notNull().unique(),
  stepId: integer('step_id').notNull(),
  analysisId: integer('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  isSync: boolean('is_sync').notNull().default(false),
}, t => [
  unique().on(t.galaxyId, t.analysisId),
  index().on(t.ownerId),
  index().on(t.analysisId),
  index().on(t.galaxyId),
])

export const jobsRelations = relations(jobs, ({ many, one }) => {
  return {
    outputs: many(analysisOutputs),
    analysis: one(analyses, {
      fields: [jobs.analysisId],
      references: [analyses.id],
    }),
  }
})
