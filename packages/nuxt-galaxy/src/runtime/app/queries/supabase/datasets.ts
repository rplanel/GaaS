import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'
import { useSupabaseClient } from '#imports'
import { defineQuery, defineQueryOptions, useQuery } from '@pinia/colada'
import { ref, toValue } from 'vue'

export const SUPABASE_DATASETS_QUERY_KEYS = {
  root: ['supabase', 'datasets'] as const,
  list: () => [...SUPABASE_DATASETS_QUERY_KEYS.root, 'list'] as const,
  byId: (id: number) => [...SUPABASE_DATASETS_QUERY_KEYS.root, id] as const,
  download: (storagePath?: string, bucketName?: string) => [...SUPABASE_DATASETS_QUERY_KEYS.root, 'download', {
    storagePath,
    bucketName,
  }] as const,
  preview: (storagePath: string) => [...SUPABASE_DATASETS_QUERY_KEYS.root, 'preview', storagePath] as const,
}

async function supabaseDatasetsById(supabase: SupabaseClient<Database>, id: number) {
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

async function supabaseDownloadDataset(supabase: SupabaseClient<Database>, storagePath: string): Promise<Blob> {
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

/**
 *
 */
export interface PreviewResult {
  lines: string[]
  totalLines: number
  isComplete: boolean
  fileSize?: number
}

async function supabasePreviewDataset(supabase: SupabaseClient<Database>, storagePath: string): Promise<PreviewResult> {
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

export const useDownloadDataset = defineQuery(() => {
  const supabase = useSupabaseClient<Database>()
  const bucketName = ref<string>('analysis_files')
  const storagePath = ref<string | undefined>(undefined)

  const { state, ...rest } = useQuery({
    key: SUPABASE_DATASETS_QUERY_KEYS.download(toValue(storagePath), toValue(bucketName)),
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

export const previewDatasetQuery = defineQueryOptions(
  ({ storagePath, supabase }: { storagePath: string, supabase: SupabaseClient<Database> }) => ({
    key: SUPABASE_DATASETS_QUERY_KEYS.preview(storagePath),
    query: () => supabasePreviewDataset(supabase, storagePath),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  }),
)
