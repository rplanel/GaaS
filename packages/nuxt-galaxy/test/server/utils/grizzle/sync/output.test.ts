import type { SupabaseClient } from '@supabase/supabase-js'
import type * as bt from 'blendtype'
import type { Database } from '../../../../../src/runtime/types/database'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { Effect, HashMap, Layer, Logger, LogLevel } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logStreamBytes } from '../../../../../src/runtime/server/utils/grizzle/stream-log'
import { syncOutputDatasetEffect, SyncOutputError } from '../../../../../src/runtime/server/utils/grizzle/sync/output'
import { createFailingGalaxyLayer, createRoutedGalaxyLayer, expectFailure, mockGalaxyDataset } from '../../../fixtures'

function createLogCaptureLayer(messages: string[]): Layer.Layer<never> {
  const logger = Logger.make(({ logLevel, message, annotations }) => {
    const level = logLevel.label
    const annotationString = HashMap.toEntries(annotations)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ')
    const formatted = annotationString.length > 0
      ? `[${level}] ${String(message)} ${annotationString}`
      : `[${level}] ${String(message)}`
    messages.push(formatted)
  })

  return Logger.replace(Logger.defaultLogger, logger).pipe(
    Layer.merge(Logger.minimumLogLevel(LogLevel.Debug)),
  )
}

function createLogCaptureRuntime(messages: string[]) {
  const logLayer = createLogCaptureLayer(messages)
  return Effect.runSync(Effect.runtime().pipe(Effect.provide(logLayer)))
}

const mockStorageUpload = vi.fn()

beforeEach(() => {
  mockStorageUpload.mockClear()
})

vi.mock('../../../../../src/runtime/server/utils/grizzle/supabase', () => ({
  uploadStreamToStorage: (...args: any[]) => mockStorageUpload(...args),
}))

interface MockSupabaseConfig {
  existingOutputResult?: { data: unknown, error: unknown }
  historyResult?: { data: unknown, error: unknown }
  datasetInsertResult?: { data: unknown, error: unknown }
  outputInsertResult?: { data: unknown, error: unknown }
  datasetUpdateResult?: { data: unknown, error: unknown }
  outputUpdateResult?: { data: unknown, error: unknown }
}

function createMockSupabase(config: MockSupabaseConfig = {}): SupabaseClient<Database> {
  const calls: Record<string, any[]> = {}
  let currentTable: string | null = null

  const terminal = (result?: { data: unknown, error: unknown }) =>
    Promise.resolve(result ?? { data: null, error: null })

  const updateChain: Record<string, any> = {}
  const insertChain: Record<string, any> = {}
  const selectChain: Record<string, any> = {}
  const chain: Record<string, any> = {}

  const recordCall = (method: string, ...args: any[]) => {
    if (!calls[method])
      calls[method] = []
    calls[method].push(args)
    return chain
  }

  Object.assign(chain, {
    schema: vi.fn(() => chain),
    from: vi.fn((table) => {
      currentTable = table
      return recordCall('from', table)
    }),
    select: vi.fn((columns) => {
      recordCall('select', columns)
      return selectChain
    }),
    eq: vi.fn((column, value) => recordCall('eq', column, value)),
    where: vi.fn(() => chain),
    single: vi.fn(() => terminal(config.historyResult)),
    maybeSingle: vi.fn(() => terminal(config.existingOutputResult)),
    insert: vi.fn((payload) => {
      recordCall('insert', payload)
      return insertChain
    }),
    update: vi.fn((payload) => {
      recordCall('update', payload)
      return updateChain
    }),
    delete: vi.fn(() => chain),
  })

  Object.assign(selectChain, chain, {
    single: vi.fn(() => terminal(config.datasetInsertResult)),
    maybeSingle: vi.fn(() => terminal(config.existingOutputResult)),
  })

  Object.assign(insertChain, chain, {
    select: vi.fn((columns) => {
      recordCall('insertSelect', columns)
      return selectChain
    }),
    then: vi.fn((resolve: (v: unknown) => unknown) => terminal(config.outputInsertResult).then(resolve)),
  })

  Object.assign(updateChain, chain, {
    eq: vi.fn((column, value) => {
      recordCall('updateEq', column, value)
      return {
        then: (resolve: (v: unknown) => unknown) =>
          terminal(currentTable === 'datasets' ? config.datasetUpdateResult : config.outputUpdateResult).then(resolve),
      }
    }),
  })

  return {
    schema: vi.fn(() => chain),
    from: vi.fn(() => chain),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: { id: 'storage-id', path: 'path/to/file' }, error: null })),
      })),
    },
    __calls: calls,
  } as unknown as SupabaseClient<Database>
}

const mockHistoryGalaxyId = 'galaxy-history-1'

function createMockStream(chunks: Uint8Array[] = []): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(chunk)
      controller.close()
    },
  })
}

function createGalaxyLayer(dataset: bt.GalaxyDataset, stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream | null) {
  return createRoutedGalaxyLayer({
    [`contents/${dataset.id}/display`]: stream,
    [`contents/${dataset.id}`]: dataset,
  })
}

describe('syncOutputDatasetEffect', () => {
  it('inserts output metadata without download for non-terminal dataset', async () => {
    const nonTerminalDataset = { ...mockGalaxyDataset, state: 'running' as bt.DatasetState, id: 'gdid' }
    const layer = createGalaxyLayer(nonTerminalDataset, null)
    const supabase = createMockSupabase({
      existingOutputResult: { data: null, error: null },
      historyResult: { data: { galaxy_id: mockHistoryGalaxyId }, error: null },
      datasetInsertResult: { data: { id: 7 }, error: null },
      outputInsertResult: { data: null, error: null },
    })

    await Effect.runPromise(syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner-uuid-1', supabase, layer))

    expect(mockStorageUpload).not.toHaveBeenCalled()
    expect(supabase.schema().from).toHaveBeenCalledWith('analysis_outputs')
    expect(supabase.schema().from).toHaveBeenCalledWith('histories')
    expect(supabase.schema().from).toHaveBeenCalledWith('datasets')
  })

  it('skips download and upload when existing output dataset is unchanged', async () => {
    const terminalDataset = { ...mockGalaxyDataset, state: 'ok' as bt.DatasetState, id: 'gdid', name: 'terminal.txt' }
    const layer = createGalaxyLayer(terminalDataset, createMockStream())
    mockStorageUpload.mockReturnValue(Effect.succeed({ id: 'storage-id', path: 'uuid/terminal.txt' }))
    const supabase = createMockSupabase({
      existingOutputResult: {
        data: {
          id: 5,
          dataset_id: 9,
          state: 'ok',
          datasets: { id: 9, galaxy_id: 'gdid', storage_object_id: 'storage-object-1' },
        },
        error: null,
      },
      historyResult: { data: { galaxy_id: mockHistoryGalaxyId }, error: null },
    })

    await Effect.runPromise(syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner-uuid-1', supabase, layer))

    expect(mockStorageUpload).not.toHaveBeenCalled()

    const calls = (supabase as any).__calls
    expect(calls.insert).toBeUndefined()
    expect(calls.update).toBeUndefined()

    expect(calls.select).toContainEqual(['id, dataset_id, state, datasets!inner(id, galaxy_id, storage_object_id)'])
  })

  it('streams terminal-ok dataset to storage', async () => {
    const chunks = [new TextEncoder().encode('hello'), new TextEncoder().encode(' world')]
    const terminalDataset = { ...mockGalaxyDataset, state: 'ok' as bt.DatasetState, id: 'gdid', name: 'terminal.txt' }
    const layer = createGalaxyLayer(terminalDataset, createMockStream(chunks))
    mockStorageUpload.mockReturnValue(Effect.succeed({ id: 'storage-id', path: 'uuid/terminal.txt' }))
    const supabase = createMockSupabase({
      existingOutputResult: { data: null, error: null },
      historyResult: { data: { galaxy_id: mockHistoryGalaxyId }, error: null },
      datasetInsertResult: { data: { id: 8 }, error: null },
      outputInsertResult: { data: null, error: null },
    })
    const logs: string[] = []
    const logLayer = createLogCaptureLayer(logs)

    await syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner-uuid-1', supabase, layer)
      .pipe(Effect.provide(logLayer), Effect.runPromise)

    expect(mockStorageUpload).toHaveBeenCalled()

    const wrappedStream = mockStorageUpload.mock.calls[0][2] as ReadableStream<Uint8Array>
    const reader = wrappedStream.getReader()
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      totalBytes += value.byteLength
    }

    expect(totalBytes).toBe(11)

    const downloadLogs = logs.filter(log => log.includes('dataset download'))
    expect(downloadLogs).toHaveLength(2)
    expect(downloadLogs[0]).toContain('dataset download started')
    expect(downloadLogs[0]).toContain('analysisId="1"')
    expect(downloadLogs[0]).toContain('jobId=42')
    expect(downloadLogs[0]).toContain('historyId="galaxy-history-1"')
    expect(downloadLogs[0]).toContain('datasetId="gdid"')
    expect(downloadLogs[1]).toContain('dataset download returned')

    const streamLogs = logs.filter(log => log.includes('context="sync-output"'))
    expect(streamLogs).toHaveLength(3)
    expect(streamLogs[0]).toContain('[sync-output] stream chunk')
    expect(streamLogs[0]).toContain('chunkBytes=5')
    expect(streamLogs[0]).toContain('totalBytes=5')
    expect(streamLogs[1]).toContain('[sync-output] stream chunk')
    expect(streamLogs[1]).toContain('chunkBytes=6')
    expect(streamLogs[1]).toContain('totalBytes=11')
    expect(streamLogs[2]).toContain('[sync-output] stream finished')
    expect(streamLogs[2]).toContain('totalBytes=11')

    expect(logs.some(log => log.includes('dataset upsert complete'))).toBe(true)
  })

  it('updates an existing output dataset when state differs', async () => {
    const terminalDataset = { ...mockGalaxyDataset, state: 'ok' as bt.DatasetState, id: 'gdid' }
    const layer = createGalaxyLayer(terminalDataset, createMockStream())
    mockStorageUpload.mockReturnValue(Effect.succeed({ id: 'storage-id', path: 'uuid/terminal.txt' }))
    const supabase = createMockSupabase({
      existingOutputResult: {
        data: {
          id: 5,
          dataset_id: 9,
          state: 'running',
          datasets: { id: 9, galaxy_id: 'gdid', storage_object_id: 'storage-object-1', state: 'running' },
        },
        error: null,
      },
      historyResult: { data: { galaxy_id: mockHistoryGalaxyId }, error: null },
      datasetUpdateResult: { data: null, error: null },
      outputUpdateResult: { data: null, error: null },
    })

    await Effect.runPromise(syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner-uuid-1', supabase, layer))

    expect(mockStorageUpload).toHaveBeenCalled()
    expect(supabase.schema().from).toHaveBeenCalledWith('datasets')
    expect(supabase.schema().from).toHaveBeenCalledWith('analysis_outputs')

    const calls = (supabase as any).__calls
    expect(calls.insert).toBeUndefined()
    expect(calls.insertSelect).toBeUndefined()

    expect(calls.select).toContainEqual(['id, dataset_id, state, datasets!inner(id, galaxy_id, storage_object_id)'])

    expect(calls.update).toHaveLength(3)
    expect(calls.update[0]).toEqual([{ owner: 'owner-uuid-1' }])
    expect(calls.update[1]).toEqual([
      {
        dataset_name: terminalDataset.name,
        galaxy_metadata: {
          extension: terminalDataset.extension,
          data_lines: terminalDataset.metadata_data_lines,
          misc_blurb: terminalDataset.misc_blurb,
          peek: terminalDataset.peek,
        },
        storage_object_id: 'storage-id',
        storage_path: 'uuid/terminal.txt',
      },
    ])
    expect(calls.update[2]).toEqual([{ state: terminalDataset.state }])
    expect(calls.from).toContainEqual(['objects'])
    expect(calls.updateEq).toEqual([['id', 'storage-id'], ['id', 9], ['id', 5]])
  })

  it('clears stale storage references when re-syncing an existing non-terminal dataset', async () => {
    const updatedDataset = { ...mockGalaxyDataset, state: 'running' as bt.DatasetState, id: 'gdid', name: 'renamed.txt', metadata_data_lines: 200, misc_blurb: '200 lines', peek: 'updated peek' }
    const layer = createGalaxyLayer(updatedDataset, null)
    const supabase = createMockSupabase({
      existingOutputResult: { data: { id: 5, dataset_id: 9, state: 'running' }, error: null },
      historyResult: { data: { galaxy_id: mockHistoryGalaxyId }, error: null },
      datasetUpdateResult: { data: null, error: null },
      outputUpdateResult: { data: null, error: null },
    })

    await Effect.runPromise(syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner-uuid-1', supabase, layer))

    expect(mockStorageUpload).not.toHaveBeenCalled()

    const calls = (supabase as any).__calls
    expect(calls.insert).toBeUndefined()
    expect(calls.insertSelect).toBeUndefined()

    expect(calls.update).toHaveLength(2)
    expect(calls.update[0]).toEqual([
      {
        dataset_name: updatedDataset.name,
        galaxy_metadata: {
          extension: updatedDataset.extension,
          data_lines: updatedDataset.metadata_data_lines,
          misc_blurb: updatedDataset.misc_blurb,
          peek: updatedDataset.peek,
        },
        storage_object_id: null,
        storage_path: null,
      },
    ])
    expect(calls.update[1]).toEqual([{ state: updatedDataset.state }])
  })

  it('streams terminal-ok dataset to storage from Node ReadableStream', async () => {
    const chunks = [Buffer.from('hello'), Buffer.from(' world')]
    const terminalDataset = { ...mockGalaxyDataset, state: 'ok' as bt.DatasetState, id: 'gdid', name: 'terminal.txt' }
    const layer = createGalaxyLayer(terminalDataset, Readable.from(chunks))
    mockStorageUpload.mockReturnValue(Effect.succeed({ id: 'storage-id', path: 'uuid/terminal.txt' }))
    const supabase = createMockSupabase({
      existingOutputResult: { data: null, error: null },
      historyResult: { data: { galaxy_id: mockHistoryGalaxyId }, error: null },
      datasetInsertResult: { data: { id: 8 }, error: null },
      outputInsertResult: { data: null, error: null },
    })
    const logs: string[] = []
    const logLayer = createLogCaptureLayer(logs)

    await syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner-uuid-1', supabase, layer)
      .pipe(Effect.provide(logLayer), Effect.runPromise)

    expect(mockStorageUpload).toHaveBeenCalled()

    const nodeStream = mockStorageUpload.mock.calls[0][2] as NodeJS.ReadableStream
    const received: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      nodeStream.on('data', chunk => received.push(chunk as Buffer))
      nodeStream.on('end', () => resolve())
      nodeStream.on('error', reject)
    })

    expect(Buffer.concat(received).toString()).toBe('hello world')

    const downloadLogs = logs.filter(log => log.includes('dataset download'))
    expect(downloadLogs).toHaveLength(2)
    expect(downloadLogs[0]).toContain('dataset download started')
    expect(downloadLogs[1]).toContain('dataset download returned')

    const streamLogs = logs.filter(log => log.includes('context="sync-output"'))
    expect(streamLogs).toHaveLength(3)
    expect(streamLogs[0]).toContain('[sync-output] stream chunk')
    expect(streamLogs[0]).toContain('chunkBytes=5')
    expect(streamLogs[0]).toContain('totalBytes=5')
    expect(streamLogs[1]).toContain('[sync-output] stream chunk')
    expect(streamLogs[1]).toContain('chunkBytes=6')
    expect(streamLogs[1]).toContain('totalBytes=11')
    expect(streamLogs[2]).toContain('[sync-output] stream finished')
    expect(streamLogs[2]).toContain('totalBytes=11')

    expect(logs.some(log => log.includes('dataset upsert complete'))).toBe(true)
  })

  it('fails with SyncOutputError when dataset insert returns an error', async () => {
    const terminalDataset = { ...mockGalaxyDataset, state: 'ok' as bt.DatasetState, id: 'gdid' }
    const layer = createGalaxyLayer(terminalDataset, createMockStream())
    mockStorageUpload.mockReturnValue(Effect.succeed({ id: 'storage-id', path: 'uuid/terminal.txt' }))
    const supabase = createMockSupabase({
      existingOutputResult: { data: null, error: null },
      historyResult: { data: { galaxy_id: mockHistoryGalaxyId }, error: null },
      datasetInsertResult: { data: null, error: { message: 'insert failed' } },
    })

    const exit = await Effect.runPromiseExit(syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner-uuid-1', supabase, layer))

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(SyncOutputError)
      expect((error as SyncOutputError).message).toContain('insert failed')
    })
  })

  it('fails with SyncOutputError when analysis_outputs insert returns an error', async () => {
    const terminalDataset = { ...mockGalaxyDataset, state: 'ok' as bt.DatasetState, id: 'gdid' }
    const layer = createGalaxyLayer(terminalDataset, createMockStream())
    mockStorageUpload.mockReturnValue(Effect.succeed({ id: 'storage-id', path: 'uuid/terminal.txt' }))
    const supabase = createMockSupabase({
      existingOutputResult: { data: null, error: null },
      historyResult: { data: { galaxy_id: mockHistoryGalaxyId }, error: null },
      datasetInsertResult: { data: { id: 8 }, error: null },
      outputInsertResult: { data: null, error: { message: 'analysis_outputs insert failed' } },
    })

    const exit = await Effect.runPromiseExit(syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner-uuid-1', supabase, layer))

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(SyncOutputError)
      expect((error as SyncOutputError).message).toContain('analysis_outputs insert failed')
    })

    const calls = (supabase as any).__calls
    expect(calls.insert).toHaveLength(2)
    expect(calls.insert[0][0]).toMatchObject({ owner_id: 'owner-uuid-1', galaxy_id: 'gdid' })
    expect(calls.insert[1][0]).toMatchObject({ analysis_id: 1, dataset_id: 8, job_id: 42, state: 'ok' })
  })

  it('fails with SyncOutputError when Galaxy is unreachable', async () => {
    const layer = createFailingGalaxyLayer(new Error('Service Unavailable'))
    const supabase = createMockSupabase({
      existingOutputResult: { data: null, error: null },
      historyResult: { data: { galaxy_id: mockHistoryGalaxyId }, error: null },
    })

    const exit = await Effect.runPromiseExit(syncOutputDatasetEffect('gdid', 1, 1, 42, 'owner-uuid-1', supabase, layer))

    expectFailure(exit, (error) => {
      expect(error).toBeInstanceOf(SyncOutputError)
      expect((error as SyncOutputError).message).toContain('Service Unavailable')
    })
  })
})

describe('logStreamBytes', () => {
  it('logs a web stream read error', async () => {
    const logs: string[] = []
    const runtime = createLogCaptureRuntime(logs)
    const error = new Error('web read failed')
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(error)
      },
    })

    const wrapped = logStreamBytes(source, runtime, 'history-id', 'dataset-id') as ReadableStream<Uint8Array>

    await expect((async () => {
      const reader = wrapped.getReader()
      await reader.read()
    })()).rejects.toThrow('web read failed')

    const syncOutputLogs = logs.filter(log => log.includes('context="sync-output"'))
    expect(syncOutputLogs).toHaveLength(1)
    expect(syncOutputLogs[0]).toContain('[sync-output] stream error')
    expect(syncOutputLogs[0]).toContain('error="web read failed"')
  })

  it('logs a Node stream error and destroys the passthrough', async () => {
    const logs: string[] = []
    const runtime = createLogCaptureRuntime(logs)
    const error = new Error('node read failed')
    const source = new Readable({ read() {} })
    const wrapped = logStreamBytes(source, runtime, 'history-id', 'dataset-id') as NodeJS.ReadableStream

    const received: Buffer[] = []
    const endPromise = new Promise<void>((resolve, reject) => {
      wrapped.on('data', chunk => received.push(chunk as Buffer))
      wrapped.on('error', (err) => {
        expect(err.message).toBe('node read failed')
        resolve()
      })
      wrapped.on('end', () => reject(new Error('expected error')))
    })

    wrapped.once('data', () => {
      process.nextTick(() => source.emit('error', error))
    })
    source.push(Buffer.from('hello'))

    await endPromise

    expect(Buffer.concat(received).toString()).toBe('hello')
    expect(wrapped.destroyed).toBe(true)

    const syncOutputLogs = logs.filter(log => log.includes('context="sync-output"'))
    expect(syncOutputLogs).toHaveLength(2)
    expect(syncOutputLogs[0]).toContain('[sync-output] stream chunk')
    expect(syncOutputLogs[0]).toContain('chunkBytes=5')
    expect(syncOutputLogs[0]).toContain('totalBytes=5')
    expect(syncOutputLogs[1]).toContain('[sync-output] stream error')
    expect(syncOutputLogs[1]).toContain('error="node read failed"')
  })
})
