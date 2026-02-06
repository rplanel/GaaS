import { defineRelations } from 'drizzle-orm'
import { datasets } from '../galaxy/datasets'
import { buckets } from './buckets'
import { objects } from './objects'

export const bucketsRelations = defineRelations({ buckets, objects }, r => ({
  buckets: {
    objects: r.many.objects({
      from: r.buckets.id,
      to: r.objects.bucketId,
    }),
  },
}))

export const objectsRelations = defineRelations({ objects, datasets, buckets }, r => ({
  objects: {
    datasets: r.many.datasets({
      from: r.objects.id,
      to: r.datasets.storageObjectId,
    }),
    bucket: r.one.buckets({
      from: r.objects.bucketId,
      to: r.buckets.id,
    }),
  },
}))
