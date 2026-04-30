import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import {
  addHistoryEffect,
  DeleteGalaxyHistoryError,
  deleteHistory,
  getAnalysisHistory,
  getHistoryDb,
  GetHistoryError,
  insertHistory,
  InsertHistoryError,
  isHistoryTerminalState,
  updateHistoryState,
  updateIsHistorySync,
} from '../../../../src/runtime/server/utils/grizzle/histories'
import {
  createMockDrizzle,
  createMockGalaxyLayer,
  expectFailure,
  mockDbHistory,
  mockGalaxyHistory,
} from '../../fixtures'

// Mock getCurrentUserEffect to avoid nested Drizzle resolution issues
vi.mock('../../../../src/runtime/server/utils/grizzle/user', () => ({
  getCurrentUserEffect: vi.fn(() =>
    Effect.succeed({
      user: { id: 1, email: 'admin@example.org', instanceId: 1, createdAt: new Date('2024-01-01') },
      instance: { id: 1, url: 'https://galaxy.example.com', name: 'Test Galaxy', createdAt: new Date('2024-01-01') },
    }),
  ),
}))

describe('isHistoryTerminalState', () => {
  it('should return true for terminal states', () => {
    expect(isHistoryTerminalState('ok')).toBe(true)
    expect(isHistoryTerminalState('error')).toBe(true)
    expect(isHistoryTerminalState('empty')).toBe(true)
    expect(isHistoryTerminalState('discarded')).toBe(true)
  })

  it('should return false for non-terminal states', () => {
    expect(isHistoryTerminalState('new')).toBe(false)
    expect(isHistoryTerminalState('running')).toBe(false)
    expect(isHistoryTerminalState('queued')).toBe(false)
    expect(isHistoryTerminalState('upload')).toBe(false)
  })
})

describe('getHistoryDb', () => {
  it('should return a history when found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([mockDbHistory])

    const result = await getHistoryDb(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(mockDbHistory)
  })

  it('should return null when no history is found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getHistoryDb(999, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })

  it('should fail with GetHistoryError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.where = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('DB error')).catch(reject)
      return chain
    })

    const exit = await getHistoryDb(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GetHistoryError)
    })
  })
})

describe('getAnalysisHistory', () => {
  it('should return analysis+history join when found', async () => {
    const drizzle = createMockDrizzle()
    const joinResult = {
      analyses: { id: 1, name: 'Test Analysis', historyId: 1 },
      histories: mockDbHistory,
    }
    drizzle.setResult([joinResult])

    const result = await getAnalysisHistory(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual(joinResult)
  })

  it('should return null when no analysis history is found', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const result = await getAnalysisHistory(999, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toBeNull()
  })
})

describe('insertHistory', () => {
  it('should insert a history and return id + galaxyId', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1, galaxyId: 'galaxy-history-1' }])

    const result = await insertHistory({
      name: 'Test History',
      ownerId: 'owner-uuid-1',
      userId: 1,
      galaxyId: 'galaxy-history-1',
      state: 'new',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual({ id: 1, galaxyId: 'galaxy-history-1' })
    expect(drizzle.mock.insert).toHaveBeenCalled()
  })

  it('should fail with InsertHistoryError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.insert.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.values = () => chain
      chain.returning = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('Insert failed')).catch(reject)
      return chain
    })

    const exit = await insertHistory({
      name: 'Test',
      ownerId: 'owner-uuid-1',
      userId: 1,
      galaxyId: 'galaxy-history-1',
      state: 'new',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(InsertHistoryError)
    })
  })
})

describe('deleteHistory', () => {
  it('should delete a history', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult(undefined)

    await deleteHistory(1).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(drizzle.mock.delete).toHaveBeenCalled()
  })

  it('should fail with DeleteGalaxyHistoryError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.delete.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.where = () => chain
      chain.then = (_r: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('Delete failed')).catch(reject)
      return chain
    })

    const exit = await deleteHistory(1).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(DeleteGalaxyHistoryError)
    })
  })
})

describe('addHistoryEffect', () => {
  it('should create a Galaxy history and insert it in the DB', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 1, galaxyId: 'galaxy-history-1' }])

    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    const result = await addHistoryEffect('New History', 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromise,
    )

    expect(result).toEqual({ id: 1, galaxyId: 'galaxy-history-1' })
  })
})

describe('updateHistoryState', () => {
  it('should update history state and return the result', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ historyId: 1, state: 'ok' }])

    const result = await updateHistoryState(1, 'ok').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(result).toEqual({ historyId: 1, state: 'ok' })
    expect(drizzle.mock.update).toHaveBeenCalled()
  })
})

describe('updateIsHistorySync', () => {
  it('should set isSync to true', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult(undefined)

    await updateIsHistorySync(1, 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromise,
    )

    expect(drizzle.mock.update).toHaveBeenCalled()
  })
})
