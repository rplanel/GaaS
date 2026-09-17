export interface LogFileOptions {
  dir?: string
  maxFiles?: number
  pretty?: boolean
}

export interface LogOptions {
  enabled?: boolean
  service?: string
  minLevel?: 'debug' | 'info' | 'warn' | 'error'
  pretty?: boolean
  console?: boolean
  file?: boolean | LogFileOptions
  redact?: boolean
}

export interface ResolvedLogFileOptions {
  dir: string
  maxFiles: number
  pretty: boolean
}

export interface ResolvedLogOptions {
  enabled: boolean
  service: string
  minLevel: 'debug' | 'info' | 'warn' | 'error'
  pretty: boolean
  console: boolean
  file: ResolvedLogFileOptions | false
  redact: boolean
}

export function resolveLogOptions(isDev: boolean, logs: LogOptions = {}): ResolvedLogOptions {
  const fileInput = logs.file === false
    ? false
    : (logs.file === true ? {} : (logs.file ?? {}))
  return {
    enabled: logs.enabled ?? true,
    service: logs.service ?? 'nuxt-galaxy',
    minLevel: logs.minLevel ?? 'debug',
    pretty: logs.pretty ?? isDev,
    console: logs.console ?? true,
    file: fileInput === false
      ? false
      : {
          dir: fileInput.dir ?? '.evlog/logs',
          maxFiles: fileInput.maxFiles ?? 7,
          pretty: fileInput.pretty ?? isDev,
        },
    redact: logs.redact ?? !isDev,
  }
}
