import { DatasetStates, HistoryStates, InvocationStates, JobStates } from 'blendtype'
import { pgSchema, varchar } from 'drizzle-orm/pg-core'

export const galaxy = pgSchema('galaxy')

export const datasetStateEnum = galaxy.enum('dataset_state', DatasetStates)
export const jobStateEnum = galaxy.enum('job_state', JobStates)
export const historyStateEnum = galaxy.enum('history_state', HistoryStates)
export const invocationStateEnum = galaxy.enum('invocation_state', InvocationStates)

/**
 * GalaxyItem
 */
export const galaxyItem = {
  galaxyId: varchar('galaxy_id', { length: 256 }).notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  annotation: varchar('annotation', { length: 200 }),
} as const

// Table exports are intentionally omitted from this file. Each table module
// imports `galaxy` from here, so re-exporting any table would create a
// circular dependency during module load. This matches the existing codebase
// pattern where tables are imported directly from their source files.
