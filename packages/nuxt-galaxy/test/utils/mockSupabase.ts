import type { SupabaseClient } from '@supabase/supabase-js'
import type { Mock } from 'vitest'
import type { Database } from '../../src/runtime/types/database'
import { vi } from 'vitest'

// eslint-disable-next-line unused-imports/no-unused-vars
interface MockSupabaseOperations {
  // Storage operations
  storage?: {
    from: Mock
    download?: Mock
    createSignedUrl?: Mock
  }
  // Database operations
  schema?: Mock
  from?: Mock
  select?: Mock
  eq?: Mock
  single?: Mock
}

interface MockSupabaseConfig {
  storage?: {
    downloadResponse?: { data: Blob | null, error: Error | null }
    createSignedUrlResponse?: { data: { signedUrl: string } | null, error: Error | null }
  }
  database?: {
    selectResponse?: { data: unknown[] | null, error: Error | null }
  }
}

/**
 * Creates a mock Supabase client for testing
 */
export function createMockSupabase(config: MockSupabaseConfig = {}): SupabaseClient<Database> {
  const mockSupabase = {
    // Storage mock
    storage: {
      from: vi.fn().mockReturnThis(),
      createSignedUrl: vi.fn().mockResolvedValue(
        config.storage?.createSignedUrlResponse ?? {
          data: { signedUrl: 'https://mocked.supabase.co/storage/v1/object/sign/analysis_files/test.txt?token=test' },
          error: null,
        },
      ),
      download: vi.fn().mockResolvedValue(
        config.storage?.downloadResponse ?? {
          data: new Blob(['test file content']),
          error: null,
        },
      ),
    },

    // Database mock
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(
      config.database?.selectResponse ?? {
        data: [],
        error: null,
      },
    ),
  } as unknown as SupabaseClient<Database>

  return mockSupabase
}

/**
 * Creates a mock Supabase client with custom database response
 */
export function createMockSupabaseWithData<T>(data: T[]): SupabaseClient<Database> {
  return createMockSupabase({
    database: {
      selectResponse: { data, error: null },
    },
  })
}

/**
 * Creates a mock Supabase client that throws errors
 */
export function createMockSupabaseWithError(error: Error): SupabaseClient<Database> {
  return createMockSupabase({
    database: {
      selectResponse: { data: null, error },
    },
  })
}
