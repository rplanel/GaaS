import { http, HttpResponse } from 'msw'

/**
 * Mock handlers for Supabase storage API
 * These intercept HTTP requests made by Supabase client methods
 *
 * NOTE: Tests should use server.use() to override specific handlers
 * for their test scenarios
 */
export const handlers = [
  // Mock Supabase database API
  http.get('https://*.supabase.co/rest/v1/*', ({ params }) => {
    const tableName = params[0] as string

    // Return mock data based on table
    switch (tableName) {
      case 'analyses':
        return HttpResponse.json([
          {
            id: 123,
            job_id: 'test-job-123',
            state: 'ok',
            metadata: {},
            created_at: '2024-01-01T00:00:00Z',
          },
        ])
      default:
        return HttpResponse.json([])
    }
  }),
]
