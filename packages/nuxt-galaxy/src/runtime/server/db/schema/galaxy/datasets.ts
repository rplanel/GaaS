import { eq, getTableColumns, relations } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  serial,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users as owners } from '../auth/users'
import { galaxy, galaxyItem } from '../galaxy'
import { objects } from '../storage/objects'
import { analysisInputs } from './analysisInputs'
import { analysisOutputs } from './analysisOutputs'
import { histories } from './histories'
import { tags } from './tags'

/**
 * Datasets
 */

const { name, ...galaxyItemNoName } = galaxyItem

export const datasets = galaxy.table('datasets', {
  id: serial('id').primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
  historyId: integer('history_id').notNull().references(() => histories.id, { onDelete: 'cascade' }),
  storageObjectId: uuid('storage_object_id').notNull().references(
    () => objects.id,
    { onDelete: 'cascade' },
  ),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  uuid: uuid('uuid').notNull().unique(),
  extension: varchar('extension', { length: 100 }).notNull(),
  // fileSize: integer('file_size').notNull(),
  dataLines: integer('data_lines'),
  miscBlurb: varchar('misc_blurb', { length: 512 }),
  datasetName: varchar('dataset_name', { length: 256 }).notNull(),
  ...galaxyItemNoName,
}, t => ([
  unique().on(t.historyId, t.galaxyId),
  index().on(t.ownerId),
  index().on(t.historyId),
  index().on(t.storageObjectId),
  index().on(t.galaxyId),
]))

/**
 * Datasets tags
 */

export const datasetsToTags = galaxy.table('datasets_to_tags', {
  datasetId: integer('dataset_id').notNull().references(() => datasets.id),
  tagId: integer('tag_id').notNull().references(() => tags.id),
}, t => ({
  pk: primaryKey({ columns: [t.datasetId, t.tagId] }),
}))

export const datasetsRelations = relations(datasets, ({ many, one }) => {
  return {
    datasetTags: many(datasetsToTags),
    analysisInput: one(analysisInputs),
    analysisOuput: one(analysisOutputs),
    owner: one(owners, {
      fields: [datasets.ownerId],
      references: [owners.id],
    }),
    history: one(histories, {
      fields: [datasets.historyId],
      references: [histories.id],
    }),
    storageObject: one(objects, {
      fields: [datasets.storageObjectId],
      references: [objects.id],
    }),
  }
})

/**
 * datasets view
 */

export const datasetsWithStoragePath = galaxy.view('datasets_with_storage_path')
  .as(
    (qb) => {
      const { id: idDataset, ...restDatasetColumns } = getTableColumns(datasets)

      return qb
        .select({
          ...restDatasetColumns,
          ...getTableColumns(objects),
        })
        .from(datasets)
        .innerJoin(
          objects,
          eq(datasets.storageObjectId, objects.id),
        )
    },
  )

export const datasetsToTagsRelations = relations(datasetsToTags, ({ one }) => {
  return {
    dataset: one(datasets, {
      fields: [datasetsToTags.datasetId],
      references: [datasets.id],
    }),
    tag: one(tags, {
      fields: [datasetsToTags.tagId],
      references: [tags.id],
    }),
  }
})

/**
 * Analysis inputs with storage path
 */

export const analysisInputsStoragePath = galaxy.view('analysis_inputs_with_storage_path').as(
  (qb) => {
    return qb.select({
      ...getTableColumns(analysisInputs),
      ...getTableColumns(datasets),
      storageObjectPath: objects.name,
      metadata: objects.metadata,
    })
      .from(analysisInputs)
      .innerJoin(datasets, eq(analysisInputs.datasetId, datasets.id))
      .innerJoin(
        objects,
        eq(datasets.storageObjectId, objects.id),
      )
  },
)

/**
 * Analysis outputs with storage path
 */

export const analysisOutputsStoragePath = galaxy.view('analysis_outputs_with_storage_path').as(
  (qb) => {
    return qb.select({
      ...getTableColumns(analysisOutputs),
      ...getTableColumns(datasets),
      storageObjectPath: objects.name,
      metadata: objects.metadata,
    })
      .from(analysisOutputs)
      .innerJoin(datasets, eq(analysisOutputs.datasetId, datasets.id))
      .innerJoin(
        objects,
        eq(datasets.storageObjectId, objects.id),
      )
  },
)
