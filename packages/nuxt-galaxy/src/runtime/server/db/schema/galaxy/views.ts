import { eq, getColumns } from 'drizzle-orm'
import { galaxy } from '../galaxy'
import { objects } from '../storage/objects'
import { analysisInputs } from './analysisInputs'
import { analysisOutputs } from './analysisOutputs'
import { datasets } from './datasets'

/**
 * Analysis inputs with storage path
 */
export const analysisInputsStoragePath = galaxy.view('analysis_inputs_with_storage_path')
  .with({
    securityInvoker: true,
  })
  .as(
    (qb) => {
      return qb.select({
        ...getColumns(analysisInputs),
        ...getColumns(datasets),
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
export const analysisOutputsStoragePath = galaxy.view('analysis_outputs_with_storage_path')
  .with({
    securityInvoker: true,
  })
  .as(
    (qb) => {
      return qb.select({
        ...getColumns(analysisOutputs),
        ...getColumns(datasets),
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
