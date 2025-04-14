import type { InvocationState } from 'blendtype'

import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  json,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users as owners } from '../auth/users'
import { galaxy, invocationStateEnum } from '../galaxy'
import { analysisInputs } from './analysisInputs'
import { analysisOutputs } from './analysisOutputs'
import { histories } from './histories'
import { jobs } from './jobs'
import { workflows } from './workflows'

export const analyses = galaxy.table('analyses', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  state: invocationStateEnum('state').$type<InvocationState>().notNull(),
  parameters: json('parameters').notNull(),
  datamap: json('datamap').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
  historyId: integer('history_id').notNull().unique().references(() =>
    histories.id, { onDelete: 'cascade' }),
  workflowId: integer('workflow_id').notNull().references(() => workflows.id),
  galaxyId: varchar('galaxy_id', { length: 256 }).notNull(),
  stderr: text('stderr'),
  stdout: text('stdout'),
  invocation: json('invocation').notNull(),
  isSync: boolean('is_sync').notNull().default(false),
}, table => [
  index().on(table.ownerId),
  index().on(table.historyId),
  index().on(table.workflowId),
  index().on(table.galaxyId),
])

export const analysesRelations = relations(analyses, ({ one, many }) => {
  return {
    workflow: one(workflows, {
      fields: [analyses.workflowId],
      references: [workflows.id],
    }),
    owner: one(owners, {
      fields: [analyses.ownerId],
      references: [owners.id],
    }),
    history: one(histories, {
      fields: [analyses.historyId],
      references: [histories.id],
    }),
    analysisInputs: many(analysisInputs),
    analysisOutputs: many(analysisOutputs),
    jobs: many(jobs),
  }
})

/**
 * Analyis details view
 *
 */

// export const analysesDetails = galaxy.view('analyses_details')
//   .as(
//     (qb) => {
//       return qb
//         .select({ analysis: sql`to_jsonb(${analyses})`.as('analysis') })
//         .from(analyses)
//         .innerJoin(histories, eq(analyses.historyId, histories.id))
//         .innerJoin(workflows, eq(analyses.workflowId, workflows.id))
//     },
//   )
