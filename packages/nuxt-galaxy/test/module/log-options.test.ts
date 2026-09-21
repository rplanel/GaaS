import { describe, expect, it } from 'vitest'
import { resolveLogOptions } from '../../src/log-options'

/** `file` is `false | ResolvedLogFileOptions`; every case below configures it. */
function fileOptions(resolved: ReturnType<typeof resolveLogOptions>) {
  const { file } = resolved
  if (file === false)
    throw new Error('expected file logging to be configured')
  return file
}

describe('resolveLogOptions', () => {
  it('uses defaults in development', () => {
    const resolved = resolveLogOptions(true, {})
    expect(resolved).toEqual({
      enabled: true,
      service: 'nuxt-galaxy',
      minLevel: 'debug',
      pretty: true,
      console: true,
      file: { dir: '.evlog/logs', maxFiles: 7, pretty: true },
      redact: false,
    })
  })

  it('uses production defaults', () => {
    const resolved = resolveLogOptions(false, {})
    expect(resolved.redact).toBe(true)
    expect(resolved.pretty).toBe(false)
    expect(fileOptions(resolved).pretty).toBe(false)
  })

  it('merges custom options', () => {
    const resolved = resolveLogOptions(true, {
      service: 'custom',
      file: { dir: 'logs/galaxy', maxFiles: 14 },
    })
    expect(resolved.service).toBe('custom')
    expect(fileOptions(resolved).dir).toBe('logs/galaxy')
    expect(fileOptions(resolved).maxFiles).toBe(14)
    expect(fileOptions(resolved).pretty).toBe(true)
  })

  it('normalizes file: true to default file options', () => {
    const resolved = resolveLogOptions(true, { file: true })
    expect(resolved.file).toEqual({
      dir: '.evlog/logs',
      maxFiles: 7,
      pretty: true,
    })
  })

  it('preserves file: false', () => {
    const resolved = resolveLogOptions(true, { file: false })
    expect(resolved.file).toBe(false)
  })
})
