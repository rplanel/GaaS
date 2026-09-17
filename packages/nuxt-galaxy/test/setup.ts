import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './mocks/server'

vi.mock('evlog/client', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
