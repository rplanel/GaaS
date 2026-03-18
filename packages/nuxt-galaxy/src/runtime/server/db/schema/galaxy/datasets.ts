import { eq, getColumns } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgPolicy,
  primaryKey,
  serial,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid } from 'drizzle-orm/supabase'
import { users as owners } from '../auth/users'
import { galaxy, galaxyItem } from '../galaxy'
import { objects } from '../storage/objects'
import { histories } from './histories'
import { tags } from './tags'

/**
 * Datasets
 */

/**
 * Galaxy dataset metadata interface
 * Stores Galaxy-specific metadata in JSONB format (snake_case to match Galaxy API)
 */
export interface GalaxyDatasetMetadata {
  extension: string
  data_lines?: number
  misc_blurb?: string
  peek?: string
}

const { name, ...galaxyItemNoName } = galaxyItem

export const datasets = galaxy.table(
  'datasets',
  {
    id: serial('id').primaryKey(),
    ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
    historyId: integer('history_id').notNull().references(() => histories.id, { onDelete: 'cascade' }),
    storageObjectId: uuid('storage_object_id').notNull().references(
      () => objects.id,
      { onDelete: 'cascade' },
    ),
    storagePath: varchar('storage_path', { length: 512 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    uuid: uuid('uuid').notNull().unique(),
    galaxyMetadata: jsonb('galaxy_metadata').notNull().$type<GalaxyDatasetMetadata>(),
    datasetName: varchar('dataset_name', { length: 256 }).notNull(),
    ...galaxyItemNoName,
  },
  t => ([
    unique().on(t.historyId, t.galaxyId),
    index().on(t.ownerId),
    index().on(t.historyId),
    index().on(t.storageObjectId),
    index().on(t.galaxyId),
    pgPolicy('Users can insert documents', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: eq(t.ownerId, authUid),
    }),
    pgPolicy('Users can query their own documents', {
      for: 'select',
      to: authenticatedRole,
      using: eq(t.ownerId, authUid),
    }),
  ]),
)

/**
 * Datasets tags
 */

export const datasetsToTags = galaxy.table('datasets_to_tags', {
  datasetId: integer('dataset_id').notNull().references(() => datasets.id),
  tagId: integer('tag_id').notNull().references(() => tags.id),
}, t => [
  primaryKey({ columns: [t.datasetId, t.tagId] }),
])

/**
 * datasets view
 */

export const datasetsWithStoragePath = galaxy.view('datasets_with_storage_path')
  .with({
    securityInvoker: true,
  })
  .as(
    (qb) => {
      const { id: idDataset, ...restDatasetColumns } = getColumns(datasets)

      return qb
        .select({
          ...restDatasetColumns,
          ...getColumns(objects),
        })
        .from(datasets)
        .innerJoin(
          objects,
          eq(datasets.storageObjectId, objects.id),
        )
    },
  )
