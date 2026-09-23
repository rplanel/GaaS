import { Effect, Exit } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { runTaskEffect } from '../../../../src/runtime/server/utils/evlog-effect'
import {
  addHistoryEffect,
  CreateGalaxyHistoryError,
  DeleteGalaxyHistoryError,
  deleteHistory,
  discardPreparedHistoryEffect,
  getAnalysisHistory,
  getHistoryDb,
  GetHistoryError,
  insertHistory,
  InsertHistoryError,
  isHistoryTerminalState,
  updateHistoryState,
  updateIsHistorySync,
} from '../../../../src/runtime/server/utils/grizzle/histories'
import { GalaxyUserNotFoundError } from '../../../../src/runtime/server/utils/grizzle/user'
import {
  createMockDrizzle,
  createMockGalaxyLayer,
  createRecordingGalaxyLayer,
  expectFailure,
  mockDbHistory,
  mockDrizzleDeleteRejects,
  mockDrizzleInsertRejects,
  mockDrizzleSelectRejects,
  mockGalaxyHistory,
} from '../../fixtures'
import { createMockRequestLogger } from '../../setup'

// Mock getCurrentUserEffect to avoid nested Drizzle resolution issues. The
// module's error classes are kept real so `toBeInstanceOf` below compares
// against the class production throws.
vi.mock('../../../../src/runtime/server/utils/grizzle/user', async importOriginal => ({
  ...await importOriginal<typeof import('../../../../src/runtime/server/utils/grizzle/user')>(),
  getCurrentUserEffect: vi.fn(() =>
    Effect.succeed({
      user: { id: 1, email: 'admin@example.org', instanceId: 1, createdAt: new Date('2024-01-01') },
      instance: { id: 1, url: 'https://galaxy.example.com', name: 'Test Galaxy', createdAt: new Date('2024-01-01') },
    }),
  ),
}))

describe('isHistoryTerminalState', () => {
  it('uses HistoryStates, not DatasetStates', () => {
    expect(isHistoryTerminalState('ok')).toBe(true)
    expect(isHistoryTerminalState('running')).toBe(false)
  })

  it('should return true for terminal states', () => {
    expect(isHistoryTerminalState('ok')).toBe(true)
    expect(isHistoryTerminalState('error')).toBe(true)
  })

  it('should return false for non-terminal states', () => {
    expect(isHistoryTerminalState('new')).toBe(false)
    expect(isHistoryTerminalState('running')).toBe(false)
    expect(isHistoryTerminalState('queued')).toBe(false)
    expect(isHistoryTerminalState('upload')).toBe(false)
    expect(isHistoryTerminalState('empty')).toBe(false)
    expect(isHistoryTerminalState('discarded')).toBe(false)
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
    drizzle.mock.select.mockImplementation(mockDrizzleSelectRejects(['from', 'where'], new Error('DB error')))

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

  it('refuses an insert that returned no row', async () => {
    // the row was just written, so none coming back means the database broke
    // a promise rather than that anything was legitimately absent
    const drizzle = createMockDrizzle()
    drizzle.setResult([])

    const exit = await insertHistory({
      name: 'Test History',
      ownerId: 'owner-uuid-1',
      userId: 1,
      galaxyId: 'galaxy-history-1',
      state: 'new',
    }).pipe(
      Effect.provide(drizzle.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect((error as { message: string }).message).toContain('Expected exactly one row')
    })
  })

  it('should fail with InsertHistoryError on database error', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.insert.mockImplementation(mockDrizzleInsertRejects(['values', 'returning'], new Error('Insert failed')))

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
    drizzle.mock.delete.mockImplementation(mockDrizzleDeleteRejects(['where'], new Error('Delete failed')))

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

  // Each guard below used to fall off the end of the generator and resolve
  // with `undefined`, which is a *success*: the caller could not tell the three
  // apart, and `POST /api/db/analyses` answered 200 with an empty body.
  it('says which of the two causes it was when there is no Galaxy user row', async () => {
    const userModule = await import('../../../../src/runtime/server/utils/grizzle/user')
    const getCurrentUserEffectSpy = userModule.getCurrentUserEffect as ReturnType<typeof vi.fn>
    getCurrentUserEffectSpy.mockReturnValueOnce(Effect.succeed(null))

    const drizzle = createMockDrizzle()
    const galaxyLayer = createMockGalaxyLayer(mockGalaxyHistory)

    const exit = await addHistoryEffect('New History', 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(GalaxyUserNotFoundError)
    })
  })

  it('fails rather than resolving with undefined when Galaxy creates nothing', async () => {
    const drizzle = createMockDrizzle()
    // Galaxy answering with an empty body: the response is typed non-nullable,
    // so only the guard stands between this and a successful `undefined`
    const galaxyLayer = createMockGalaxyLayer(undefined)

    const exit = await addHistoryEffect('New History', 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(CreateGalaxyHistoryError)
    })
  })

  it('keeps Galaxy vocabulary out of what a caller reads', async () => {
    const drizzle = createMockDrizzle()
    const galaxyLayer = createMockGalaxyLayer(undefined)

    const exit = await addHistoryEffect('New History', 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxyLayer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect((error as CreateGalaxyHistoryError).message.toLowerCase()).not.toContain('history')
      expect((error as CreateGalaxyHistoryError).message).toContain('analysis')
    })
  })

  // The narrower of the two windows #39 describes: Galaxy holds a container
  // and the row that would have recorded it is the thing that failed, so
  // nothing outside this function has an identifier to clean up with. It is
  // taken back out from in here, where the identifier still exists.
  it('removes the container it created when the row recording it cannot be written', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.insert.mockImplementation(
      mockDrizzleInsertRejects(['values', 'returning'], new Error('DB error')),
    )
    const galaxy = createRecordingGalaxyLayer(() => mockGalaxyHistory)

    const exit = await addHistoryEffect('New History', 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxy.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(InsertHistoryError)
    })
    expect(galaxy.calls).toEqual([
      { method: 'POST', url: 'api/histories' },
      { method: 'DELETE', url: `api/histories/${mockGalaxyHistory.id}` },
    ])
  })

  it('reports the write that failed, not whatever Galaxy answered the removal with', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.insert.mockImplementation(
      mockDrizzleInsertRejects(['values', 'returning'], new Error('DB error')),
    )
    const galaxy = createRecordingGalaxyLayer(call =>
      call.method === 'DELETE' ? new Error('Galaxy would not remove it') : mockGalaxyHistory,
    )

    const exit = await addHistoryEffect('New History', 'owner-uuid-1').pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxy.layer),
      Effect.runPromiseExit,
    )

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(InsertHistoryError)
    })
  })
})

// #39: `addHistoryEffect` runs before anything is uploaded, so every failure
// after it leaves a container on Galaxy and a row at `state: 'new'` with no
// analysis behind them. The compensation that existed hung off the upload
// step, which a request with an empty datamap never reaches.
describe('discardPreparedHistoryEffect', () => {
  it('removes the container on Galaxy and the row that records it', async () => {
    const drizzle = createMockDrizzle()
    const galaxy = createRecordingGalaxyLayer(() => mockGalaxyHistory)

    await discardPreparedHistoryEffect(mockGalaxyHistory.id, 1).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(galaxy.calls).toEqual([
      { method: 'DELETE', url: `api/histories/${mockGalaxyHistory.id}` },
    ])
    expect(drizzle.mock.delete).toHaveBeenCalledTimes(1)
  })

  // A compensation gets no second attempt, so a row left pointing at a
  // container this application can no longer account for is the mess #39 is
  // about. What Galaxy would not remove is in the log instead.
  it('removes the row even when Galaxy would not remove the container', async () => {
    const drizzle = createMockDrizzle()
    const galaxy = createRecordingGalaxyLayer(() => new Error('Galaxy would not remove it'))

    await discardPreparedHistoryEffect(mockGalaxyHistory.id, 1).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(drizzle.mock.delete).toHaveBeenCalledTimes(1)
  })

  // The log is the only place the leftover is visible, so what it says has
  // to be queryable: the cause as a field of its own and the identifiers as
  // annotations, the way the bridge writes them, rather than one object
  // stringified into the message text where no query can reach it (#45).
  it('logs what Galaxy answered as the cause, and the identifiers as annotations', async () => {
    const drizzle = createMockDrizzle()
    const galaxy = createRecordingGalaxyLayer(() => new Error('Galaxy would not remove it'))
    const taskLog = createMockRequestLogger()

    await runTaskEffect(taskLog, discardPreparedHistoryEffect(mockGalaxyHistory.id, 1).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxy.layer),
    ))

    expect(taskLog.error).toHaveBeenCalledTimes(1)
    const [message, context] = vi.mocked(taskLog.error).mock.calls[0] as [string, Record<string, unknown>]
    expect(message).toBe('galaxy would not remove the container prepared for a failed request')
    expect(context.effectCause).toContain('Galaxy would not remove it')
    expect(context.effectAnnotations).toEqual({ galaxyHistoryId: mockGalaxyHistory.id })
  })

  // Galaxy accepted the invocation, so the run exists. Removing the history
  // would cascade the analysis away from under the monitoring record still
  // counting it as Pending, which is a pairing only `deleteAnalysis` undoes.
  it('leaves a history an analysis already references alone', async () => {
    const drizzle = createMockDrizzle()
    drizzle.setResult([{ id: 5 }])
    const galaxy = createRecordingGalaxyLayer(() => mockGalaxyHistory)

    await discardPreparedHistoryEffect(mockGalaxyHistory.id, 1).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(galaxy.calls).toEqual([])
    expect(drizzle.mock.delete).not.toHaveBeenCalled()
  })

  // Leaving a container behind is recoverable; purging a running analysis is
  // not, so the unanswerable question is answered the safe way.
  it('removes nothing when it cannot tell whether an analysis was started', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.select.mockImplementation(
      mockDrizzleSelectRejects(['from', 'where'], new Error('DB error')),
    )
    const galaxy = createRecordingGalaxyLayer(() => mockGalaxyHistory)

    await discardPreparedHistoryEffect(mockGalaxyHistory.id, 1).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxy.layer),
      Effect.runPromise,
    )

    expect(galaxy.calls).toEqual([])
    expect(drizzle.mock.delete).not.toHaveBeenCalled()
  })

  // It only ever runs because something else already failed, and that is the
  // cause the caller has to be answered with. A compensation that failed on
  // top of it would replace the answer with its own.
  it('cannot fail, whatever either removal answers', async () => {
    const drizzle = createMockDrizzle()
    drizzle.mock.delete.mockImplementation(
      mockDrizzleDeleteRejects(['where'], new Error('DB error')),
    )
    const galaxy = createRecordingGalaxyLayer(() => new Error('Galaxy would not remove it'))

    const exit = await discardPreparedHistoryEffect(mockGalaxyHistory.id, 1).pipe(
      Effect.provide(drizzle.layer),
      Effect.provide(galaxy.layer),
      Effect.runPromiseExit,
    )

    expect(Exit.isSuccess(exit)).toBe(true)
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
