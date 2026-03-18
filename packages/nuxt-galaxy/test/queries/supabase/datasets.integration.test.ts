import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/runtime/types/database'
import { describe, expect, it, vi } from 'vitest'
import { previewDatasetQuery } from '../../../src/runtime/app/queries/supabase/datasets'

describe('datasets integration tests', () => {
  describe('previewDatasetQuery with mocked fetch', () => {
    const createMockFetch = (response: Response) => {
      return vi.fn().mockResolvedValue(response)
    }

    const createMockResponse = (options: {
      ok: boolean
      status?: number
      statusText?: string
      contentLength?: string
      text?: string
    }): Response => {
      return {
        ok: options.ok,
        status: options.status ?? 200,
        statusText: options.statusText ?? 'OK',
        headers: {
          get: (header: string) => {
            if (header.toLowerCase() === 'content-length') {
              return options.contentLength ?? '100'
            }
            return null
          },
        },
        text: async () => options.text ?? '',
      } as Response
    }

    it('should fetch and parse file preview successfully', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnThis(),
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://test.supabase.co/storage/v1/object/sign/analysis_files/test.txt' },
            error: null,
          }),
        },
      } as unknown as SupabaseClient<Database>

      const content = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11'
      globalThis.fetch = createMockFetch(createMockResponse({
        ok: true,
        contentLength: String(content.length),
        text: content,
      }))

      const options = previewDatasetQuery({ storagePath: 'test.txt', supabase: mockSupabase })
      const result = await options.query()

      expect(mockSupabase.storage.from).toHaveBeenCalledWith('analysis_files')
      expect(mockSupabase.storage.from('analysis_files').createSignedUrl).toHaveBeenCalledWith('test.txt', 60)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://test.supabase.co/storage/v1/object/sign/analysis_files/test.txt',
        expect.objectContaining({
          headers: {
            Range: 'bytes=0-51199',
          },
        }),
      )

      expect(result.lines).toHaveLength(10)
      expect(result.lines).toEqual(['line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7', 'line8', 'line9', 'line10'])
      expect(result.totalLines).toBe(11)
      expect(result.isComplete).toBe(false)
    })

    it('should mark preview as complete for files with 10 or fewer lines', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnThis(),
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://test.supabase.co/storage/v1/object/sign/analysis_files/small.txt' },
            error: null,
          }),
        },
      } as unknown as SupabaseClient<Database>

      const content = 'line1\nline2\nline3\nline4\nline5'
      globalThis.fetch = createMockFetch(createMockResponse({
        ok: true,
        contentLength: String(content.length),
        text: content,
      }))

      const options = previewDatasetQuery({ storagePath: 'small.txt', supabase: mockSupabase })
      const result = await options.query()

      expect(result.lines).toHaveLength(5)
      expect(result.totalLines).toBe(5)
      expect(result.isComplete).toBe(true)
    })

    it('should handle signed URL creation error', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnThis(),
          createSignedUrl: vi.fn().mockResolvedValue({
            data: null,
            error: new Error('Storage error: Access denied'),
          }),
        },
      } as unknown as SupabaseClient<Database>

      const options = previewDatasetQuery({ storagePath: 'protected.txt', supabase: mockSupabase })

      await expect(options.query()).rejects.toThrow('Storage error: Access denied')
    })

    it('should handle fetch error (404 Not Found)', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnThis(),
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://test.supabase.co/storage/v1/object/sign/analysis_files/notfound.txt' },
            error: null,
          }),
        },
      } as unknown as SupabaseClient<Database>

      globalThis.fetch = createMockFetch(createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }))

      const options = previewDatasetQuery({ storagePath: 'notfound.txt', supabase: mockSupabase })

      await expect(options.query()).rejects.toThrow('Failed to fetch preview: Not Found')
    })

    it('should handle fetch error (500 Server Error)', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnThis(),
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://test.supabase.co/storage/v1/object/sign/analysis_files/error.txt' },
            error: null,
          }),
        },
      } as unknown as SupabaseClient<Database>

      globalThis.fetch = createMockFetch(createMockResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }))

      const options = previewDatasetQuery({ storagePath: 'error.txt', supabase: mockSupabase })

      await expect(options.query()).rejects.toThrow('Failed to fetch preview: Internal Server Error')
    })

    it('should handle file content with no trailing newline', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnThis(),
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://test.supabase.co/storage/v1/object/sign/analysis_files/none.txt' },
            error: null,
          }),
        },
      } as unknown as SupabaseClient<Database>

      const content = 'line1\nline2\nline3'
      globalThis.fetch = createMockFetch(createMockResponse({
        ok: true,
        contentLength: String(content.length),
        text: content,
      }))

      const options = previewDatasetQuery({ storagePath: 'none.txt', supabase: mockSupabase })
      const result = await options.query()

      expect(result.lines).toHaveLength(3)
      expect(result.totalLines).toBe(3)
      expect(result.isComplete).toBe(true)
    })
  })
})
