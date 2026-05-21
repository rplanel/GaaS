import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'
import { defineQueryOptions } from '@pinia/colada'
import { supabaseAnalysesInputsViewByAnalysisId } from './analysisInputsView'
import { supabaseAnalysesOutputsViewByAnalysisId } from './analysisOutputsView'

export const SUPABASE_DATASETS_QUERY_KEYS = {
  root: ['supabase', 'datasets'] as const,
  list: () => [...SUPABASE_DATASETS_QUERY_KEYS.root, 'list'] as const,
  byId: (id: number) => [...SUPABASE_DATASETS_QUERY_KEYS.root, id] as const,
  byAnalysisId: (analysisId: number) => [...SUPABASE_DATASETS_QUERY_KEYS.root, 'by-analysis', analysisId] as const,
  download: (storagePath?: string, bucketName?: string) => [...SUPABASE_DATASETS_QUERY_KEYS.root, 'download', {
    storagePath,
    bucketName,
  }] as const,
  preview: (storagePath: string) => [...SUPABASE_DATASETS_QUERY_KEYS.root, 'preview', storagePath] as const,
}

export async function supabaseDatasetsById(supabase: SupabaseClient<Database>, id: number) {
  return supabase
    .schema('galaxy')
    .from('analyses')
    .select('*')
    .eq('id', id)
}

export const datasetsByIdQuery = defineQueryOptions(
  ({ id, supabase }: { id: number, supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_DATASETS_QUERY_KEYS.byId(id),
    query: () => supabaseDatasetsById(supabase, id),
  }),
)

export async function supabaseDatasetsByAnalysisId(supabase: SupabaseClient<Database>, analysisId: number) {
  return await Promise.all([
    supabaseAnalysesInputsViewByAnalysisId(supabase, analysisId),
    supabaseAnalysesOutputsViewByAnalysisId(supabase, analysisId),
  ])
}

export const datasetsByAnalysisIdQuery = defineQueryOptions(
  ({ analysisId, supabase }: { analysisId: number, supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_DATASETS_QUERY_KEYS.byAnalysisId(analysisId),
    query: () => supabaseDatasetsByAnalysisId(supabase, analysisId),
  }),
)

/**
 *
 */
export interface PreviewResult {
  lines: string[]
  totalLines: number
  isComplete: boolean
  fileSize?: number
}

export async function supabasePreviewDataset(supabase: SupabaseClient<Database>, storagePath: string): Promise<PreviewResult> {
  const PREVIEW_SIZE = 50 * 1024 // 50KB

  // 1. Create signed URL (1 minute expiry)
  const { data: signedUrlData, error: signedUrlError } = await supabase
    .storage
    .from('analysis_files')
    .createSignedUrl(storagePath, 60)

  if (signedUrlError) {
    throw signedUrlError
  }

  // 2. Fetch only the first 50KB
  const response = await fetch(signedUrlData.signedUrl, {
    headers: {
      Range: `bytes=0-${PREVIEW_SIZE - 1}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch preview: ${response.statusText}`)
  }

  // 3. Parse response
  const contentLength = response.headers.get('content-length')
  const fileSize = contentLength ? Number.parseInt(contentLength, 10) : undefined

  const text = await response.text()
  const allLines = text.split('\n')

  // 4. Extract first 10 lines
  const lines = allLines.slice(0, 10)
  const totalLines = allLines.length

  return {
    lines,
    totalLines,
    isComplete: lines.length < 10 && totalLines <= 10,
    fileSize,
  }
}

export const previewDatasetQuery = defineQueryOptions(
  ({ storagePath, supabase }: { storagePath: string, supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_DATASETS_QUERY_KEYS.preview(storagePath),
    query: () => supabasePreviewDataset(supabase, storagePath),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  }),
)
