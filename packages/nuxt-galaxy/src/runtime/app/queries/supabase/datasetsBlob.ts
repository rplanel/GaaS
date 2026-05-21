import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'
import type { AnalysisInputWithStoragePathRow, AnalysisOutputWithStoragePathRow } from '../../../types/nuxt-galaxy'

import { useSupabaseClient } from '#imports'
import { defineQuery, defineQueryOptions, useQuery } from '@pinia/colada'
import { ref, toValue } from 'vue'
import { supabaseDatasetsByAnalysisId } from './datasets'

export const SUPABASE_DATASETS_BLOB_QUERY_KEYS = {
  root: ['supabase', 'datasets', 'blob'] as const,
  byAnalysisId: (analysisId: number) => [...SUPABASE_DATASETS_BLOB_QUERY_KEYS.root, 'by-analysis', analysisId] as const,
  download: (storagePath?: string, bucketName?: string) => [...SUPABASE_DATASETS_BLOB_QUERY_KEYS.root, 'download', {
    storagePath,
    bucketName,
  }] as const,
}

export async function supabaseDownloadDataset(supabase: SupabaseClient<Database>, storagePath: string): Promise<Blob> {
  const { data, error } = await supabase
    .storage
    .from('analysis_files')
    .download(storagePath)

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error('No data returned from download')
  }

  return data
}

export interface DatasetBlob<T> {
  blob: Blob
  entry: T
}

export async function supabaseAnalysisDatasetsQuery(
  supabase: SupabaseClient<Database>,
  analysisId: number,
): Promise<[DatasetBlob<AnalysisInputWithStoragePathRow>[], DatasetBlob<AnalysisOutputWithStoragePathRow>[]]> {
  const [inputs, outputs] = await supabaseDatasetsByAnalysisId(supabase, analysisId)

  const inputBlobs = await Promise.all(
    inputs
      .filter((input): input is typeof input & { storage_path: string } => !!input.storage_path)
      .map(async input => ({
        blob: await supabaseDownloadDataset(supabase, input.storage_path),
        entry: input,
      })),
  )

  const outputBlobs = await Promise.all(
    outputs
      .filter((output): output is typeof output & { storage_path: string } => !!output.storage_path)
      .map(async output => ({
        blob: await supabaseDownloadDataset(supabase, output.storage_path),
        entry: output,
      })),
  )

  return [inputBlobs, outputBlobs]
}

export const analysisDatasetsQuery = defineQueryOptions(
  ({ analysisId, supabase }: { analysisId: number, supabase: SupabaseClient<Database> }) => ({
    key: [...SUPABASE_DATASETS_BLOB_QUERY_KEYS.byAnalysisId(analysisId), 'datasets'] as const,
    query: () => supabaseAnalysisDatasetsQuery(supabase, analysisId),
  }),
)

export const useDownloadDataset = defineQuery(() => {
  const supabase = useSupabaseClient<Database>()
  const bucketName = ref<string>('analysis_files')
  const storagePath = ref<string | undefined>(undefined)

  const { state, ...rest } = useQuery({
    key: SUPABASE_DATASETS_BLOB_QUERY_KEYS.download(toValue(storagePath), toValue(bucketName)),
    enabled: () => !!supabase && !!toValue(bucketName) && !!toValue(storagePath),
    query: () => supabaseDownloadDataset(supabase, toValue(storagePath)!),
  })

  return {
    bucketName,
    storagePath,
    state,
    ...rest,
  }
})
