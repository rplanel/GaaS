# Testing Guide for nuxt-galaxy

This directory contains the test suite for the nuxt-galaxy module, using Vitest with Nuxt environment.

## Architecture

```
test/
├── setup.ts                 # MSW lifecycle setup (optional, kept for extensibility)
├── mocks/
│   ├── server.ts           # MSW server instance (optional, kept for extensibility)
│   └── handlers.ts         # Base HTTP handlers (optional, kept for extensibility)
├── utils/
│   ├── mockSupabase.ts     # Supabase client mocking utilities
│   └── test-helpers.ts     # mountWithPlugins(), flushPromises
└── queries/
    └── supabase/
        ├── datasets.test.ts           # Unit tests (pure query options)
        └── datasets.integration.test.ts # Integration tests (with mocked fetch)
```

**Note:** We use direct `globalThis.fetch` mocking for HTTP calls instead of MSW. The MSW files are kept for future use if needed, but all current tests use manual mocking.

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- --run test/queries/supabase/datasets.test.ts

# Run tests in watch mode
pnpm test:watch
```

## Testing Patterns

### 1. Unit Testing Query Options (defineQueryOptions)

Use manual mocking for the Supabase client:

```typescript
import { datasetsByIdQuery } from '../../../src/runtime/app/queries/supabase/datasets'
import { createMockSupabase } from '../../utils/mockSupabase'

it('should return correct query configuration', () => {
  const mockSupabase = createMockSupabase()
  const options = datasetsByIdQuery({ id: 123, supabase: mockSupabase })

  expect(options.key).toEqual(['supabase', 'datasets', 123])
  expect(typeof options.query).toBe('function')
})
```

### 2. Integration Testing with Fetch Mocking

Use direct `globalThis.fetch` mocking for HTTP requests:

```typescript
import { vi } from 'vitest'

it('should fetch file content', async () => {
  // Mock globalThis.fetch to return fake HTTP responses
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: {
      get: (key: string) => key === 'content-length' ? '100' : null
    },
    text: async () => 'line1\nline2\nline3'
  })

  const options = previewDatasetQuery({ storagePath: 'test.txt', supabase: mockSupabase })
  const result = await options.query()

  expect(result.lines).toEqual(['line1', 'line2', 'line3'])
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://test.supabase.co/storage/v1/object/sign/analysis_files/test.txt',
    expect.objectContaining({
      headers: { Range: 'bytes=0-51199' }
    })
  )
})
```

### 3. Testing Error Scenarios

Mock errors to test error handling:

```typescript
// Test Supabase error
const mockSupabase = createMockSupabaseWithError(new Error('Storage access denied'))
await expect(query()).rejects.toThrow('Storage access denied')

// Test HTTP error (404)
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: false,
  statusText: 'Not Found'
})
await expect(query()).rejects.toThrow('Failed to fetch preview: Not Found')
```

### 4. Testing Composables with Nuxt Context

Use `mountWithPlugins()` helper:

```typescript
import { createTestComponent, flushPromises, mountWithPlugins } from '../utils/test-helpers'

it('should use query composable', async () => {
  const TestComponent = createTestComponent(() => {
    const { state } = useQuery({
      key: ['test'],
      query: async () => 'test data',
    })
    return { state }
  })

  const wrapper = mountWithPlugins(TestComponent)
  await flushPromises()
  expect(wrapper.vm.state.data).toBe('test data')
})
```

## What is Mocking?

**Mocking** means creating fake versions of real things so you can:
- ✅ Test code in isolation (no real database/network needed)
- ✅ Control what data comes back (predictable results)
- ✅ Test error scenarios easily
- ✅ Make tests fast (no real HTTP requests or database queries)

### Without mocking:
```typescript
// ❌ Connects to real Supabase - slow, unpredictable, requires network
const result = await supabase.from('analyses').select('*').eq('id', 123)
```

### With mocking:
```typescript
// ✅ Uses fake Supabase - instant, predictable, works offline
const mockSupabase = createMockSupabase()
const result = await mockSupabase.from('analyses').select('*').eq('id', 123)
// Returns: { data: [], error: null } (instantly)
```

## Important Notes

1. **Always flushPromises** after async operations
2. **Use vi.fn()** to create mock functions in Vitest
3. **Don't use createTestingPinia()** - it breaks Pinia Colada
4. **Manual mock** for Supabase client methods (createMockSupabase)
5. **globalThis.fetch** for HTTP requests (not MSW for now)

## Utility Functions

### createMockSupabase(config?)
Creates a fake Supabase client that behaves like the real one but returns fake data.

```typescript
const mockSupabase = createMockSupabase()
// Returns an object with storage.from(), schema(), from(), select(), eq() methods
```

### createMockSupabaseWithData(data)
Creates a mock with specific database query results.

```typescript
const mockSupabase = createMockSupabaseWithData([
  { id: 1, name: 'Test' }
])
// Returns: { data: [{ id: 1, name: 'Test' }], error: null }
```

### createMockSupabaseWithError(error)
Creates a mock that throws errors (for testing error handling).

```typescript
const mockSupabase = createMockSupabaseWithError(new Error('DB error'))
// Returns: { data: null, error: Error('DB error') }
```

### mountWithPlugins(component, options?)
Mounts a Vue component with createPinia() + PiniaColada plugins (required for testing Pinia Colada queries).

### flushPromises
Waits for all pending promises to resolve (needed after async operations in tests).
