import { PassThrough } from 'node:stream'
import { Effect, Runtime } from 'effect'

export function logStreamBytes(
  stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  runtime: Runtime.Runtime<never>,
  historyId: string,
  datasetId: string,
): ReadableStream<Uint8Array> | NodeJS.ReadableStream {
  const log = (message: string, extra: Record<string, unknown> = {}) =>
    Runtime.runSync(runtime)(
      Effect.log(`[sync-output] ${message}`).pipe(
        Effect.annotateLogs({ context: 'sync-output', historyId, datasetId, ...extra }),
      ),
    )

  if (stream instanceof ReadableStream) {
    let totalBytes = 0
    let reader: ReadableStreamDefaultReader<Uint8Array>
    return new ReadableStream({
      start(controller) {
        reader = stream.getReader()
        const pump = () =>
          reader.read().then(({ done, value }) => {
            if (done) {
              log('stream finished', { totalBytes })
              controller.close()
              return
            }
            totalBytes += value.byteLength
            log('stream chunk', { chunkBytes: value.byteLength, totalBytes })
            controller.enqueue(value)
            pump()
          }, (error) => {
            log('stream error', { error: error instanceof Error ? error.message : String(error) })
            controller.error(error)
          })
        pump()
      },
      cancel(reason) {
        return reader.cancel(reason).finally(() => reader.releaseLock())
      },
    })
  }

  const pass = new PassThrough()
  let totalBytes = 0
  // eslint-disable-next-line node/prefer-global/buffer
  stream.on('data', (chunk: Buffer) => {
    totalBytes += chunk.length
    log('stream chunk', { chunkBytes: chunk.length, totalBytes })
  })
  stream.on('end', () => log('stream finished', { totalBytes }))
  stream.on('error', (error) => {
    log('stream error', { error: error.message })
    pass.destroy(error)
  })
  stream.pipe(pass)
  return pass
}
