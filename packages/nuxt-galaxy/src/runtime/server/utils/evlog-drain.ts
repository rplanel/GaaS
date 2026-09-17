import type { ResolvedLogFileOptions } from '../../../log-options'
import { createFsDrain } from 'evlog/fs'

export interface EvlogDrainNitroApp {
  hooks: {
    hook: (name: 'evlog:drain', handler: (ctx: any) => void | Promise<void>) => void
  }
}

export function registerEvlogFsDrain(nitroApp: EvlogDrainNitroApp, fileOptions: ResolvedLogFileOptions | false): void {
  if (!fileOptions)
    return
  nitroApp.hooks.hook('evlog:drain', createFsDrain({
    dir: fileOptions.dir,
    maxFiles: fileOptions.maxFiles,
    pretty: fileOptions.pretty,
  }))
}
