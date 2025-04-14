/**
 * The vast majority of the type are from
 * https://github.com/galaxyproject/galaxy/tree/dev/client/src/api/schema
 */

export interface GalaxyVersion {
  version_major: string
  version_minor: string
}

export interface ErrorWithMessage {
  message: string
}

export interface ErrorWithData {
  data: {
    message: string
  }
}

export interface ErrorWithStatus {
  statusCode: number
}

export type Datamap = Record<`${number}`, { id: string, name: string, storage_object_id?: string }>

export const GalaxyStates = [
  'new',
  'upload',
  'queued',
  'running',
  'ok',
  'empty',
  'error',
  'paused',
  'setting_metadata',
  'failed_metadata',
  'deferred',
  'discarded',
  'cancelled',
  'failed',
  'scheduled',
  'ready',
  'cancelling',
  'deleted',
  'deleting',
  'resubmitted',
  'waiting',
  'stop',
  'stopped',
  'skipped',
] as const

// export const GalaxyStates = a as const

export type GalaxyState = typeof GalaxyStates[number]

export interface Hyperlink {
  /**
   * Href
   * @description The URL of the linked document.
   */
  href: string
  /**
   * Target
   * @description Specifies where to open the linked document.
   */
  target: string
  /**
   * Text
   * @description The text placeholder for the link.
   */
  text: string
}

export interface MetadataFile {
  /**
   * Download URL
   * @description The URL to download this item from the server.
   */
  download_url: string
  /**
   * File Type
   * @description TODO
   */
  file_type: string
};

export * from './dataset'
export * from './display'
export * from './history'
export * from './invocation'
export * from './job'
export * from './tag'
export * from './tool'
export * from './utils'
export * from './visualization'
export * from './workflow'
