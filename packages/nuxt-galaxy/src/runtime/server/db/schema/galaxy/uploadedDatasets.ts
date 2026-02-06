import { eq, getColumns } from 'drizzle-orm'
import { index, pgPolicy, serial, text, uuid } from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid } from 'drizzle-orm/supabase'
import { users as owners } from '../auth/users'
import { galaxy } from '../galaxy'
import { objects } from '../storage/objects'

export const uploadedDatasets = galaxy.table(
  'uploaded_datasets',
  {
    id: serial('id').primaryKey(),
    ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
    datasetName: text('dataset_name').notNull(),
    storageObjectId: uuid('storage_object_id').notNull().references(
      () => objects.id,
      { onDelete: 'cascade' },
    ).unique(),

  },
  table => [
    index().on(table.ownerId),
    index().on(table.storageObjectId),
    pgPolicy('Users can insert datasets', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: eq(table.ownerId, authUid),
    }),
    pgPolicy('Users can query their own uploaded datasets', {
      for: 'select',
      to: authenticatedRole,
      using: eq(table.ownerId, authUid),
    }),
  ],
)

export const uploadedDatasetsWithStoragePath = galaxy.view('uploaded_datasets_with_storage_path')
  .with({
    securityInvoker: true,
  })
  .as(
    (qb) => {
      return qb.select({
        ...getColumns(uploadedDatasets),
        // storageObjectPath: objects.name,
        metadata: objects.metadata,
      }).from(uploadedDatasets).innerJoin(objects, eq(uploadedDatasets.storageObjectId, objects.id))
    },
  )
