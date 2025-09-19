import type { MetadataFile } from '.'
import type { DisplayApp } from './display'
import type { JobSourceType, JobState } from './job'
import type { TagCollection } from './tag'
import type { HashFunctionNames } from './utils'
import type { Visualization } from './visualization'

export const DatasetsTerminalStates = [
  'ok',
  'empty',
  'error',
  'discarded',
  'failed_metadata',
] as const

export const DatasetStates = [
  ...DatasetsTerminalStates,
  'new',
  'upload',
  'queued',
  'running',
  'paused',
  'setting_metadata',
  'deferred',
] as const

/**
 * DatasetValidatedState
 * @enum {string}
 */
export type DatasetValidatedState = 'unknown' | 'invalid' | 'ok'

export type DataItemSourceType = 'hda' | 'ldda' | 'hdca' | 'dce' | 'dc'
export type DatasetSourceType = 'hda' | 'ldda'

export type DatasetState = typeof DatasetStates[number]
export type DatasetTerminalState = typeof DatasetsTerminalStates[number]

export type HistoryContentsResult = HDACustom
  | HDADetailed
  | HDASummary
  | HDAInaccessible
  | HDCACustom
  | HDCADetailed
  | HDCASummary

/**
 * HDASummary
 * @description History Dataset Association summary information.
 */
export interface HDASummary {
  /** Copied From Ldda Id */
  copied_from_ldda_id?: string | null
  /**
   * Create Time
   * @description The time and date this item was created.
   */
  create_time: string | null
  /**
   * Dataset ID
   * @description The encoded ID of the dataset associated with this item.
   * @example 0123456789ABCDEF
   */
  dataset_id: string
  /**
   * Deleted
   * @description Whether this item is marked as deleted.
   */
  deleted: boolean
  /**
   * Extension
   * @description The extension of the dataset.
   */
  extension: string | null
  /**
   * Genome Build
   * @description TODO
   * @default ?
   */
  genome_build?: string | null
  /**
   * HID
   * @description The index position of this item in the History.
   */
  hid: number
  /**
   * History Content Type
   * @description This is always `dataset` for datasets.
   * @constant
   * @enum {string}
   */
  history_content_type: 'dataset'
  /**
   * History ID
   * @example 0123456789ABCDEF
   */
  history_id: string
  /**
   * Id
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Name
   * @description The name of the item.
   */
  name: string | null
  /**
   * Purged
   * @description Whether this dataset has been removed from disk.
   */
  purged: boolean
  /**
   * State
   * @description The current state of this dataset.
   */
  state: DatasetState
  tags: TagCollection
  /**
   * Type
   * @description The type of this item.
   */
  type: string
  /**
   * Type - ID
   * @description The type and the encoded ID of this item. Used for caching.
   */
  type_id?: string | null
  /**
   * Update Time
   * @description The last time and date this item was updated.
   */
  update_time: string | null
  /**
   * URL
   * @deprecated
   * @description The relative URL to access this item.
   */
  url: string
  /**
   * Visible
   * @description Whether this item is visible or hidden to the user by default.
   */
  visible: boolean
}
export interface HDACustom {
  /**
   * Accessible
   * @description Whether this item is accessible to the current user due to permissions.
   */
  accessible?: boolean | null
  /**
   * Annotation
   * @description An annotation to provide details or to help understand the purpose and usage of this item.
   */
  annotation?: string | null
  /**
   * API Type
   * @deprecated
   * @description TODO
   */
  api_type?: 'file' | null
  /**
   * Copied From History Dataset Association Id
   * @description ID of HDA this HDA was copied from.
   */
  copied_from_history_dataset_association_id?: string | null
  /** Copied From Ldda Id */
  copied_from_ldda_id?: string | null
  /**
   * Create Time
   * @description The time and date this item was created.
   */
  create_time?: string | null
  /**
   * Created from basename
   * @description The basename of the output that produced this dataset.
   */
  created_from_basename?: string | null
  /**
   * Creating Job ID
   * @description The encoded ID of the job that created this dataset.
   */
  creating_job?: string | null
  /**
   * Data Type
   * @description The fully qualified name of the class implementing the data type of this dataset.
   */
  data_type?: string | null
  /**
   * Dataset ID
   * @description The encoded ID of the dataset associated with this item.
   * @example 0123456789ABCDEF
   */
  dataset_id?: string
  /**
   * Deleted
   * @description Whether this item is marked as deleted.
   */
  deleted?: boolean | null
  /**
   * Display Applications
   * @description Contains new-style display app urls.
   */
  display_apps?: DisplayApp[] | null
  /**
   * Legacy Display Applications
   * @description Contains old-style display app urls.
   */
  display_types?: DisplayApp[] | null
  /**
   * Download URL
   * @description The URL to download this item from the server.
   */
  download_url?: string | null
  /**
   * DRS ID
   * @description The DRS ID of the dataset.
   */
  drs_id?: string | null
  /**
   * Extension
   * @description The extension of the dataset.
   */
  extension?: string | null
  /**
   * File extension
   * @description The extension of the file.
   */
  file_ext?: string | null
  /**
   * File Name
   * @description The full path to the dataset file.
   */
  file_name?: string | null
  /**
   * File Size
   * @description The file size in bytes.
   */
  file_size?: number | null
  /**
   * Genome Build
   * @description TODO
   */
  genome_build?: string | null
  /**
   * Hashes
   * @description The list of hashes associated with this dataset.
   */
  hashes?: DatasetHash[] | null
  /**
   * HDA or LDDA
   * @description Whether this dataset belongs to a history (HDA) or a library (LDDA).
   */
  hda_ldda?: DatasetSourceType | null
  /**
   * HID
   * @description The index position of this item in the History.
   */
  hid?: number | null
  /**
   * History Content Type
   * @description This is always `dataset` for datasets.
   */
  history_content_type?: 'dataset' | null
  /**
   * History ID
   * @example 0123456789ABCDEF
   */
  history_id?: string
  /**
   * Id
   * @example 0123456789ABCDEF
   */
  id?: string
  /**
   * Metadata Files
   * @description Collection of metadata files associated with this dataset.
   */
  meta_files?: MetadataFile[] | null
  /**
   * Metadata
   * @description The metadata associated with this dataset.
   */
  metadata?: Record<string, never> | null
  /**
   * Miscellaneous Blurb
   * @description TODO
   */
  misc_blurb?: string | null
  /**
   * Miscellaneous Information
   * @description TODO
   */
  misc_info?: string | null
  /**
   * Model class
   * @description The name of the database model class.
   * @constant
   */
  model_class?: 'HistoryDatasetAssociation'
  /**
   * Name
   * @description The name of the item.
   */
  name?: string | null
  /**
   * Peek
   * @description A few lines of contents from the start of the file.
   */
  peek?: string | null
  /**
   * Permissions
   * @description Role-based access and manage control permissions for the dataset.
   */
  permissions?: DatasetPermissions | null
  /**
   * Purged
   * @description Whether this dataset has been removed from disk.
   */
  purged?: boolean | null
  /**
   * Rerunnable
   * @description Whether the job creating this dataset can be run again.
   */
  rerunnable?: boolean | null
  /**
   * Resubmitted
   * @description Whether the job creating this dataset has been resubmitted.
   */
  resubmitted?: boolean | null
  /**
   * Sources
   * @description The list of sources associated with this dataset.
   */
  sources?: DatasetSource[] | null
  /**
   * State
   * @description The current state of this dataset.
   */
  state?: DatasetState | null
  tags?: TagCollection | null
  /**
   * Type
   * @description This is always `file` for datasets.
   */
  type?: 'file' | null
  /**
   * Type - ID
   * @description The type and the encoded ID of this item. Used for caching.
   */
  type_id?: string | null
  /**
   * Update Time
   * @description The last time and date this item was updated.
   */
  update_time?: string | null
  /**
   * URL
   * @deprecated
   * @description The relative URL to access this item.
   */
  url?: string | null
  /** Uuid */
  uuid?: string | null
  /**
   * Validated State
   * @description The state of the datatype validation for this dataset.
   */
  validated_state?: DatasetValidatedState | null
  /**
   * Validated State Message
   * @description The message with details about the datatype validation result for this dataset.
   */
  validated_state_message?: string | null
  /**
   * Visible
   * @description Whether this item is visible or hidden to the user by default.
   */
  visible?: boolean | null
  /**
   * Visualizations
   * @description The collection of visualizations that can be applied to this dataset.
   */
  visualizations?: Visualization[] | null
  [key: string]: unknown | undefined
}

/**
 * HDADetailed
 * @description History Dataset Association detailed information.
 */
export interface HDADetailed {
  /**
   * Accessible
   * @description Whether this item is accessible to the current user due to permissions.
   */
  accessible: boolean
  /**
   * Annotation
   * @description An annotation to provide details or to help understand the purpose and usage of this item.
   */
  annotation: string | null
  /**
   * API Type
   * @deprecated
   * @description TODO
   * @default file
   * @constant
   * @enum {string}
   */
  api_type?: 'file'
  /**
   * Copied From History Dataset Association Id
   * @description ID of HDA this HDA was copied from.
   */
  copied_from_history_dataset_association_id?: string | null
  /** Copied From Ldda Id */
  copied_from_ldda_id?: string | null
  /**
   * Create Time
   * @description The time and date this item was created.
   */
  create_time: string | null
  /**
   * Created from basename
   * @description The basename of the output that produced this dataset.
   */
  created_from_basename?: string | null
  /**
   * Creating Job ID
   * @description The encoded ID of the job that created this dataset.
   */
  creating_job: string
  /**
   * Data Type
   * @description The fully qualified name of the class implementing the data type of this dataset.
   */
  data_type: string
  /**
   * Dataset ID
   * @description The encoded ID of the dataset associated with this item.
   * @example 0123456789ABCDEF
   */
  dataset_id: string
  /**
   * Deleted
   * @description Whether this item is marked as deleted.
   */
  deleted: boolean
  /**
   * Display Applications
   * @description Contains new-style display app urls.
   */
  display_apps: DisplayApp
  /**
   * Legacy Display Applications
   * @description Contains old-style display app urls.
   */
  display_types: DisplayApp[]
  /**
   * Download URL
   * @description The URL to download this item from the server.
   */
  download_url: string
  /**
   * DRS ID
   * @description The DRS ID of the dataset.
   */
  drs_id: string
  /**
   * Extension
   * @description The extension of the dataset.
   */
  extension: string | null
  /**
   * File extension
   * @description The extension of the file.
   */
  file_ext: string
  /**
   * File Name
   * @description The full path to the dataset file.
   */
  file_name?: string | null
  /**
   * File Size
   * @description The file size in bytes.
   */
  file_size: number
  /**
   * Genome Build
   * @description TODO
   * @default ?
   */
  genome_build?: string | null
  /**
   * Hashes
   * @description The list of hashes associated with this dataset.
   */
  hashes: DatasetHash[]
  /**
   * HDA or LDDA
   * @description Whether this dataset belongs to a history (HDA) or a library (LDDA).
   * @default hda
   */
  hda_ldda?: DatasetSourceType
  /**
   * HID
   * @description The index position of this item in the History.
   */
  hid: number
  /**
   * History Content Type
   * @description This is always `dataset` for datasets.
   * @constant
   * @enum {string}
   */
  history_content_type: 'dataset'
  /**
   * History ID
   * @example 0123456789ABCDEF
   */
  history_id: string
  /**
   * Id
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Metadata Files
   * @description Collection of metadata files associated with this dataset.
   */
  meta_files: MetadataFile[]
  /**
   * Metadata
   * @description The metadata associated with this dataset.
   */
  metadata?: Record<string, never> | null
  /**
   * Miscellaneous Blurb
   * @description TODO
   */
  misc_blurb?: string | null
  /**
   * Miscellaneous Information
   * @description TODO
   */
  misc_info?: string | null
  /**
   * Model class
   * @description The name of the database model class.
   * @constant
   * @enum {string}
   */
  model_class: 'HistoryDatasetAssociation'
  /**
   * Name
   * @description The name of the item.
   */
  name: string | null
  /**
   * Peek
   * @description A few lines of contents from the start of the file.
   */
  peek?: string | null
  /**
   * Permissions
   * @description Role-based access and manage control permissions for the dataset.
   */
  permissions: DatasetPermissions
  /**
   * Purged
   * @description Whether this dataset has been removed from disk.
   */
  purged: boolean
  /**
   * Rerunnable
   * @description Whether the job creating this dataset can be run again.
   */
  rerunnable: boolean
  /**
   * Resubmitted
   * @description Whether the job creating this dataset has been resubmitted.
   */
  resubmitted: boolean
  /**
   * Sources
   * @description The list of sources associated with this dataset.
   */
  sources: DatasetSource[]
  /**
   * State
   * @description The current state of this dataset.
   */
  state: DatasetState
  tags: TagCollection
  /**
   * Type
   * @description This is always `file` for datasets.
   * @default file
   * @constant
   * @enum {string}
   */
  type?: 'file'
  /**
   * Type - ID
   * @description The type and the encoded ID of this item. Used for caching.
   */
  type_id?: string | null
  /**
   * Update Time
   * @description The last time and date this item was updated.
   */
  update_time: string | null
  /**
   * URL
   * @deprecated
   * @description The relative URL to access this item.
   */
  url: string
  /**
   * UUID
   * Format: uuid4
   * @description Universal unique identifier for this dataset.
   */
  uuid: string
  /**
   * Validated State
   * @description The state of the datatype validation for this dataset.
   */
  validated_state: DatasetValidatedState
  /**
   * Validated State Message
   * @description The message with details about the datatype validation result for this dataset.
   */
  validated_state_message?: string | null
  /**
   * Visible
   * @description Whether this item is visible or hidden to the user by default.
   */
  visible: boolean
}

/**
 * HDAInaccessible
 * @description History Dataset Association information when the user can not access it.
 */
export interface HDAInaccessible {
  /**
   * Accessible
   * @constant
   * @enum {boolean}
   */
  accessible: false
  /** Copied From Ldda Id */
  copied_from_ldda_id?: string | null
  /**
   * Create Time
   * @description The time and date this item was created.
   */
  create_time: string | null
  /**
   * Deleted
   * @description Whether this item is marked as deleted.
   */
  deleted: boolean
  /**
   * HID
   * @description The index position of this item in the History.
   */
  hid: number
  /**
   * History Content Type
   * @description This is always `dataset` for datasets.
   * @constant
   * @enum {string}
   */
  history_content_type: 'dataset'
  /**
   * History ID
   * @example 0123456789ABCDEF
   */
  history_id: string
  /**
   * Id
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Name
   * @description The name of the item.
   */
  name: string | null
  /**
   * State
   * @description The current state of this dataset.
   */
  state: DatasetState
  tags: TagCollection
  /**
   * Type
   * @description The type of this item.
   */
  type: string
  /**
   * Type - ID
   * @description The type and the encoded ID of this item. Used for caching.
   */
  type_id?: string | null
  /**
   * Update Time
   * @description The last time and date this item was updated.
   */
  update_time: string | null
  /**
   * URL
   * @deprecated
   * @description The relative URL to access this item.
   */
  url: string
  /**
   * Visible
   * @description Whether this item is visible or hidden to the user by default.
   */
  visible: boolean
}

export interface HDCACustom {
  /**
   * Dataset Collection ID
   * @example 0123456789ABCDEF
   */
  collection_id?: string
  /**
   * Collection Type
   * @description The type of the collection, can be `list`, `paired`, or define subcollections using `:` as separator like `list:paired` or `list:list`.
   */
  collection_type?: string | null
  /**
   * Contents URL
   * @description The relative URL to access the contents of this History.
   */
  contents_url?: string | null
  /**
   * Create Time
   * @description The time and date this item was created.
   */
  create_time?: string | null
  /**
   * Deleted
   * @description Whether this item is marked as deleted.
   */
  deleted?: boolean | null
  /**
   * Element Count
   * @description The number of elements contained in the dataset collection. It may be None or undefined if the collection could not be populated.
   */
  element_count?: number | null
  /**
   * Elements
   * @description The summary information of each of the elements inside the dataset collection.
   */
  elements?: DCESummary[] | null
  /**
   * Elements Datatypes
   * @description A set containing all the different element datatypes in the collection.
   */
  elements_datatypes?: string[] | null
  /**
   * HID
   * @description The index position of this item in the History.
   */
  hid?: number | null
  /**
   * History Content Type
   * @description This is always `dataset_collection` for dataset collections.
   */
  history_content_type?: 'dataset_collection' | null
  /**
   * History ID
   * @example 0123456789ABCDEF
   */
  history_id?: string
  /**
   * Id
   * @example 0123456789ABCDEF
   */
  id?: string
  /**
   * Implicit Collection Jobs Id
   * @description Encoded ID for the ICJ object describing the collection of jobs corresponding to this collection
   */
  implicit_collection_jobs_id?: string | null
  /**
   * Job Source ID
   * @description The encoded ID of the Job that produced this dataset collection. Used to track the state of the job.
   */
  job_source_id?: string | null
  /**
   * Job Source Type
   * @description The type of job (model class) that produced this dataset collection. Used to track the state of the job.
   */
  job_source_type?: JobSourceType | null
  /**
   * Job State Summary
   * @description Overview of the job states working inside the dataset collection.
   */
  job_state_summary?: HDCJobStateSummary | null
  /**
   * Model class
   * @description The name of the database model class.
   * @constant
   */
  model_class?: 'HistoryDatasetCollectionAssociation'
  /**
   * Name
   * @description The name of the item.
   */
  name?: string | null
  /**
   * Populated
   * @description Whether the dataset collection elements (and any subcollections elements) were successfully populated.
   */
  populated?: boolean | null
  /**
   * Populated State
   * @description Indicates the general state of the elements in the dataset collection:- 'new': new dataset collection, unpopulated elements.- 'ok': collection elements populated (HDAs may or may not have errors).- 'failed': some problem populating, won't be populated.
   */
  populated_state?: DatasetCollectionPopulatedState | null
  /**
   * Populated State Message
   * @description Optional message with further information in case the population of the dataset collection failed.
   */
  populated_state_message?: string | null
  tags?: TagCollection | null
  /**
   * Type
   * @description This is always `collection` for dataset collections.
   */
  type?: 'collection' | null
  /**
   * Type - ID
   * @description The type and the encoded ID of this item. Used for caching.
   */
  type_id?: string | null
  /**
   * Update Time
   * @description The last time and date this item was updated.
   */
  update_time?: string | null
  /**
   * URL
   * @deprecated
   * @description The relative URL to access this item.
   */
  url?: string | null
  /**
   * Visible
   * @description Whether this item is visible or hidden to the user by default.
   */
  visible?: boolean | null
}

/**
 * HDCADetailed
 * @description History Dataset Collection Association detailed information.
 */
export interface HDCADetailed {
  /**
   * Dataset Collection ID
   * @example 0123456789ABCDEF
   */
  collection_id: string
  /**
   * Collection Type
   * @description The type of the collection, can be `list`, `paired`, or define subcollections using `:` as separator like `list:paired` or `list:list`.
   */
  collection_type: string
  /**
   * Contents URL
   * @description The relative URL to access the contents of this History.
   */
  contents_url: string
  /**
   * Create Time
   * @description The time and date this item was created.
   */
  create_time: string | null
  /**
   * Deleted
   * @description Whether this item is marked as deleted.
   */
  deleted: boolean
  /**
   * Element Count
   * @description The number of elements contained in the dataset collection. It may be None or undefined if the collection could not be populated.
   */
  element_count?: number | null
  /**
   * Elements
   * @description The summary information of each of the elements inside the dataset collection.
   * @default []
   */
  elements?: DCESummary[]
  /**
   * Elements Datatypes
   * @description A set containing all the different element datatypes in the collection.
   */
  elements_datatypes: string[]
  /**
   * HID
   * @description The index position of this item in the History.
   */
  hid: number
  /**
   * History Content Type
   * @description This is always `dataset_collection` for dataset collections.
   * @constant
   * @enum {string}
   */
  history_content_type: 'dataset_collection'
  /**
   * History ID
   * @example 0123456789ABCDEF
   */
  history_id: string
  /**
   * Id
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Implicit Collection Jobs Id
   * @description Encoded ID for the ICJ object describing the collection of jobs corresponding to this collection
   */
  implicit_collection_jobs_id?: string | null
  /**
   * Job Source ID
   * @description The encoded ID of the Job that produced this dataset collection. Used to track the state of the job.
   */
  job_source_id?: string | null
  /**
   * Job Source Type
   * @description The type of job (model class) that produced this dataset collection. Used to track the state of the job.
   */
  job_source_type?: JobSourceType | null
  /**
   * Job State Summary
   * @description Overview of the job states working inside the dataset collection.
   */
  job_state_summary?: HDCJobStateSummary | null
  /**
   * Model class
   * @description The name of the database model class.
   * @constant
   * @enum {string}
   */
  model_class: 'HistoryDatasetCollectionAssociation'
  /**
   * Name
   * @description The name of the item.
   */
  name: string | null
  /**
   * Populated
   * @description Whether the dataset collection elements (and any subcollections elements) were successfully populated.
   */
  populated?: boolean
  /**
   * Populated State
   * @description Indicates the general state of the elements in the dataset collection:- 'new': new dataset collection, unpopulated elements.- 'ok': collection elements populated (HDAs may or may not have errors).- 'failed': some problem populating, won't be populated.
   */
  populated_state: DatasetCollectionPopulatedState
  /**
   * Populated State Message
   * @description Optional message with further information in case the population of the dataset collection failed.
   */
  populated_state_message?: string | null
  tags: TagCollection
  /**
   * Type
   * @description This is always `collection` for dataset collections.
   * @default collection
   * @constant
   * @enum {string}
   */
  type?: 'collection'
  /**
   * Type - ID
   * @description The type and the encoded ID of this item. Used for caching.
   */
  type_id?: string | null
  /**
   * Update Time
   * @description The last time and date this item was updated.
   */
  update_time: string | null
  /**
   * URL
   * @deprecated
   * @description The relative URL to access this item.
   */
  url: string
  /**
   * Visible
   * @description Whether this item is visible or hidden to the user by default.
   */
  visible: boolean
}

/**
 * HDCASummary
 * @description History Dataset Collection Association summary information.
 */
export interface HDCASummary {
  /**
   * Dataset Collection ID
   * @example 0123456789ABCDEF
   */
  collection_id: string
  /**
   * Collection Type
   * @description The type of the collection, can be `list`, `paired`, or define subcollections using `:` as separator like `list:paired` or `list:list`.
   */
  collection_type: string
  /**
   * Contents URL
   * @description The relative URL to access the contents of this History.
   */
  contents_url: string
  /**
   * Create Time
   * @description The time and date this item was created.
   */
  create_time: string | null
  /**
   * Deleted
   * @description Whether this item is marked as deleted.
   */
  deleted: boolean
  /**
   * Element Count
   * @description The number of elements contained in the dataset collection. It may be None or undefined if the collection could not be populated.
   */
  element_count?: number | null
  /**
   * Elements Datatypes
   * @description A set containing all the different element datatypes in the collection.
   */
  elements_datatypes: string[]
  /**
   * HID
   * @description The index position of this item in the History.
   */
  hid: number
  /**
   * History Content Type
   * @description This is always `dataset_collection` for dataset collections.
   * @constant
   * @enum {string}
   */
  history_content_type: 'dataset_collection'
  /**
   * History ID
   * @example 0123456789ABCDEF
   */
  history_id: string
  /**
   * Id
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Job Source ID
   * @description The encoded ID of the Job that produced this dataset collection. Used to track the state of the job.
   */
  job_source_id?: string | null
  /**
   * Job Source Type
   * @description The type of job (model class) that produced this dataset collection. Used to track the state of the job.
   */
  job_source_type?: JobSourceType | null
  /**
   * Job State Summary
   * @description Overview of the job states working inside the dataset collection.
   */
  job_state_summary?: HDCJobStateSummary | null
  /**
   * Model class
   * @description The name of the database model class.
   * @constant
   * @enum {string}
   */
  model_class: 'HistoryDatasetCollectionAssociation'
  /**
   * Name
   * @description The name of the item.
   */
  name: string | null
  /**
   * Populated State
   * @description Indicates the general state of the elements in the dataset collection:- 'new': new dataset collection, unpopulated elements.- 'ok': collection elements populated (HDAs may or may not have errors).- 'failed': some problem populating, won't be populated.
   */
  populated_state: DatasetCollectionPopulatedState
  /**
   * Populated State Message
   * @description Optional message with further information in case the population of the dataset collection failed.
   */
  populated_state_message?: string | null
  tags: TagCollection
  /**
   * Type
   * @description This is always `collection` for dataset collections.
   * @default collection
   * @constant
   * @enum {string}
   */
  type?: 'collection'
  /**
   * Type - ID
   * @description The type and the encoded ID of this item. Used for caching.
   */
  type_id?: string | null
  /**
   * Update Time
   * @description The last time and date this item was updated.
   */
  update_time: string | null
  /**
   * URL
   * @deprecated
   * @description The relative URL to access this item.
   */
  url: string
  /**
   * Visible
   * @description Whether this item is visible or hidden to the user by default.
   */
  visible: boolean
}

export interface DatasetHash {
  /**
   * Extra Files Path
   * @description The path to the extra files used to generate the hash.
   */
  extra_files_path?: string | null
  /**
   * Hash Function
   * @description The hash function used to generate the hash.
   */
  hash_function: HashFunctionNames
  /**
   * Hash Value
   * @description The hash value.
   */
  hash_value: string
  /**
   * ID
   * @description Encoded ID of the dataset hash.
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Model class
   * @description The name of the database model class.
   * @constant
   * @enum {string}
   */
  model_class: 'DatasetHash'
}

export interface EncodedHdcaSourceId {
  /**
   * Id
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Source
   * @description The source of this dataset, which in the case of the model can only be `hdca`.
   * @constant
   * @enum {string}
   */
  src: 'hdca'
}

export interface GalaxyDataset {
  dataset_id: string
  type: string
  extension: string
  purged: boolean
  deleted: boolean
  name: string
  file_size: number
  tags: string[]
  resubmitted: boolean
  create_time: string
  state: DatasetState
  creating_job: string
  visible: boolean
  history_id: string
  accessible: boolean
  uuid: string
  metadata_comment_lines: number
  metadata_data_lines: number
  misc_blurb: string | null

}

export interface GalaxyUploadedDataset {
  outputs: {
    id: string
    uuid: string
    hid: number
    file_ext: string
    model_class: 'HistoryDatasetAssociation'
    name: string
    deleted: boolean
    purged: boolean
    visible: boolean
    state: DatasetState
    file_size: number
    create_time: string
    update_time: string
    history_id: string
  }[]
  jobs: {
    model_class: 'Job'
    id: string
    state: JobState
    exit_code: number | null
    update_time: string
    create_time: string
    galaxy_version: string
    tool_id: '__DATA_FETCH__'
    history_id: string
  }[]
}

export interface DatasetPermissions {
  /**
   * Access
   * @description The set of roles (encoded IDs) that can access this dataset.
   * @default []
   */
  access?: string[]
  /**
   * Management
   * @description The set of roles (encoded IDs) that can manage this dataset.
   * @default []
   */
  manage?: string[]
}

export interface DatasetSource {
  /**
   * Extra Files Path
   * @description The path to the extra files.
   */
  extra_files_path?: string | null
  /**
   * ID
   * @description Encoded ID of the dataset source.
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Source URI
   * @description The URI of the dataset source.
   */
  source_uri: string
  /**
   * Transform
   * @description The transformations applied to the dataset source.
   */
  transform?: Record<string, never>[] | null
}

/**
 * DCEType
 * @description Available types of dataset collection elements.
 * @enum {string}
 */
export type DCEType = 'hda' | 'dataset_collection'

/**
 * DCESummary
 * @description Dataset Collection Element summary information.
 */
export interface DCESummary {
  /**
   * Element Identifier
   * @description The actual name of this element.
   */
  element_identifier: string
  /**
   * Element Index
   * @description The position index of this element inside the collection.
   */
  element_index: number
  /**
   * Element Type
   * @description The type of the element. Used to interpret the `object` field.
   */
  element_type?: DCEType | null
  /**
   * Dataset Collection Element ID
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Model class
   * @description The name of the database model class.
   * @constant
   * @enum {string}
   */
  model_class: 'DatasetCollectionElement'
  /**
   * Object
   * @description The element's specific data depending on the value of `element_type`.
   */
  object?:
    | HDAObject
    | HDADetailed
    | DCObject
    | null
}

/**
 * HDCJobStateSummary
 * @description Overview of the job states working inside a dataset collection.
 */
export interface HDCJobStateSummary {
  /**
   * All jobs
   * @description Total number of jobs associated with a dataset collection.
   * @default 0
   */
  all_jobs?: number
  /**
   * Deleted jobs
   * @description Number of jobs in the `deleted` state.
   * @default 0
   */
  deleted?: number
  /**
   * Deleted new jobs
   * @description Number of jobs in the `deleted_new` state.
   * @default 0
   */
  deleted_new?: number
  /**
   * Jobs with errors
   * @description Number of jobs in the `error` state.
   * @default 0
   */
  error?: number
  /**
   * Failed jobs
   * @description Number of jobs in the `failed` state.
   * @default 0
   */
  failed?: number
  /**
   * New jobs
   * @description Number of jobs in the `new` state.
   * @default 0
   */
  new?: number
  /**
   * OK jobs
   * @description Number of jobs in the `ok` state.
   * @default 0
   */
  ok?: number
  /**
   * Paused jobs
   * @description Number of jobs in the `paused` state.
   * @default 0
   */
  paused?: number
  /**
   * Queued jobs
   * @description Number of jobs in the `queued` state.
   * @default 0
   */
  queued?: number
  /**
   * Resubmitted jobs
   * @description Number of jobs in the `resubmitted` state.
   * @default 0
   */
  resubmitted?: number
  /**
   * Running jobs
   * @description Number of jobs in the `running` state.
   * @default 0
   */
  running?: number
  /**
   * Skipped jobs
   * @description Number of jobs that were skipped due to conditional workflow step execution.
   * @default 0
   */
  skipped?: number
  /**
   * Upload jobs
   * @description Number of jobs in the `upload` state.
   * @default 0
   */
  upload?: number
  /**
   * Waiting jobs
   * @description Number of jobs in the `waiting` state.
   * @default 0
   */
  waiting?: number
}

/**
 * DatasetCollectionPopulatedState
 * @enum {string}
 */
export type DatasetCollectionPopulatedState = 'new' | 'ok' | 'failed'

/**
 * HDAObject
 * @description History Dataset Association Object
 */
export interface HDAObject {
  /** Accessible */
  accessible?: boolean | null
  /** Copied From Ldda Id */
  copied_from_ldda_id?: string | null
  /**
   * HDA or LDDA
   * @description Whether this dataset belongs to a history (HDA) or a library (LDDA).
   * @default hda
   */
  hda_ldda?: DatasetSourceType
  /**
   * History ID
   * @example 0123456789ABCDEF
   */
  history_id: string
  /**
   * History Dataset Association ID
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Model class
   * @description The name of the database model class.
   * @constant
   * @enum {string}
   */
  model_class: 'HistoryDatasetAssociation'
  /** Purged */
  purged: boolean
  /**
   * State
   * @description The current state of this dataset.
   */
  state: DatasetState
  /** Tags */
  tags: string[]
  [key: string]: unknown | undefined
}

/**
 * DCObject
 * @description Dataset Collection Object
 */
export interface DCObject {
  /**
   * Collection Type
   * @description The type of the collection, can be `list`, `paired`, or define subcollections using `:` as separator like `list:paired` or `list:list`.
   */
  collection_type: string
  /** Contents Url */
  contents_url?: string | null
  /**
   * Element Count
   * @description The number of elements contained in the dataset collection. It may be None or undefined if the collection could not be populated.
   */
  element_count?: number | null
  /**
   * Elements
   * @description The summary information of each of the elements inside the dataset collection.
   * @default []
   */
  elements?: DCESummary[]
  /**
   * Dataset Collection ID
   * @example 0123456789ABCDEF
   */
  id: string
  /**
   * Model class
   * @description The name of the database model class.
   * @constant
   * @enum {string}
   */
  model_class: 'DatasetCollection'
  /**
   * Populated
   * @description Whether the dataset collection elements (and any subcollections elements) were successfully populated.
   */
  populated?: boolean
}
