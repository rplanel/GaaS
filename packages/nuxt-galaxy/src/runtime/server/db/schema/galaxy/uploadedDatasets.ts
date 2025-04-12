import { eq, getTableColumns, relations } from 'drizzle-orm'
import { index, serial, text, uuid } from 'drizzle-orm/pg-core'
import { users as owners } from '../auth/users'
import { galaxy } from '../galaxy'
import { objects } from '../storage/objects'

export const uploadedDatasets = galaxy.table('uploaded_datasets', {
  id: serial('id').primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
  datasetName: text('dataset_name').notNull(),
  storageObjectId: uuid('storage_object_id').notNull().references(
    () => objects.id,
    { onDelete: 'cascade' },
  ).unique(),

}, table => [
  index().on(table.ownerId),
  index().on(table.storageObjectId),
])

export const uploadedDatasetsRelations = relations(uploadedDatasets, ({ one }) => {
  return {
    owner: one(owners, {
      fields: [uploadedDatasets.ownerId],
      references: [owners.id],
    }),
    storageObject: one(objects, {
      fields: [uploadedDatasets.storageObjectId],
      references: [objects.id],
    }),
  }
})

export const uploadedDatasetsWithStoragePath = galaxy.view('uploaded_datasets_with_storage_path')
  .as(
    (qb) => {
      return qb.select({
        ...getTableColumns(uploadedDatasets),
        // storageObjectPath: objects.name,
        metadata: objects.metadata,
      }).from(uploadedDatasets).innerJoin(objects, eq(uploadedDatasets.storageObjectId, objects.id))
    },
  )
