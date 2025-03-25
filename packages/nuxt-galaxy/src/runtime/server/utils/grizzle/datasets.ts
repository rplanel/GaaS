import type { serverSupabaseClient } from '#supabase/server'
import type { Datamap, DatasetState, DatasetTerminalState } from 'blendtype'

import type { Database } from '../../../types/database'
import { useRuntimeConfig } from '#imports'
import { DatasetsTerminalStates, GalaxyClient } from 'blendtype'
import { parseFilename, parseURL, stringifyParsedURL, withoutProtocol } from 'ufo'
import { datasets } from '../../db/schema/galaxy/datasets.js'
import { objects } from '../../db/schema/storage/objects.js'
import { eq, useDrizzle } from '../drizzle.js'
import { takeUniqueOrThrow } from './helper.js'

export async function uploadDatasets(
  datamap: Datamap,
  galaxyHistoryId: string,
  historyId: number,
  ownerId: string,
  supabase: serverSupabaseClient<Database>,
): Promise<({
    step: string
    galaxyId: string
    insertedId: number
  } | undefined)[]> {
  const { public: { galaxy: { url } }, galaxy: { apiKey, localDocker } } = useRuntimeConfig()
  const galaxyClient = GalaxyClient.getInstance(apiKey, url)
  const datasetEntries = Object.entries(datamap)
  return Promise.all(
    datasetEntries.map(async ([step, { name, storage_object_id: storageObjectId }]) => {
      if (storageObjectId) {
        const storageObject = await useDrizzle()
          .select()
          .from(objects)
          .where(eq(objects.id, storageObjectId))
          .then(takeUniqueOrThrow)

        if (storageObject && storageObject?.name) {
          const { data } = await supabase.storage
            .from('analysis_files')
            .createSignedUrl(storageObject.name, 60)
          if (data) {
            const { signedUrl }
              = data
            let sanitizedSignedUrl = signedUrl
            if (localDocker) {
              const parsedSignedUrl = parseURL(signedUrl)
              parsedSignedUrl.host = 'host.docker.internal'
              sanitizedSignedUrl = withoutProtocol(stringifyParsedURL(parsedSignedUrl))
            }

            // sanitizedSignedUrl = 'https://dl.pasteur.fr/fop/XPbIC5YS/ESCO001.0523.00470.prt'
            const filename = parseFilename(sanitizedSignedUrl, { strict: false })
            return galaxyClient.histories().uploadFile(
              galaxyHistoryId,
              sanitizedSignedUrl,
              filename,
            ).then((datasetHistory) => {
              return {
                step,
                name,
                uploadedDatasets: datasetHistory.outputs,
              }
            }).then(async ({ uploadedDatasets }) => {
              if (uploadedDatasets.length === 1 && uploadedDatasets[0]) {
                const {
                  id: uploadedGalaxyId,
                  name,
                  uuid,
                  file_ext: extension,
                  // file_size: fileSize,
                  create_time: createdAt,
                } = uploadedDatasets[0]
                if (storageObjectId) {
                  return useDrizzle()
                    .insert(datasets)
                    .values({
                      datasetName: name,
                      ownerId,
                      storageObjectId,
                      historyId,
                      uuid,
                      extension,
                      // fileSize,
                      createdAt: new Date(createdAt),
                      dataLines: 0,
                      galaxyId: uploadedGalaxyId,
                    })
                    .returning({
                      insertedId: datasets.id,
                      galaxyId: datasets.galaxyId,
                    })
                    .then(takeUniqueOrThrow)
                }
              }
            }).then((datasetDb) => {
              if (datasetDb) {
                const { galaxyId, insertedId } = datasetDb
                return {
                  step,
                  galaxyId,
                  insertedId,
                }
              }
            })
          }
        }
      }
      else {
        throw new Error('Storage object id is required')
      }
    }),
  )
}

export function isDatasetTerminalState(state: DatasetState): boolean {
  return DatasetsTerminalStates.includes(state as DatasetTerminalState)
}
