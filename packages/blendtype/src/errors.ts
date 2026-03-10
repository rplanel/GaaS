import type { ErrorWithMessage, ErrorWithStatus } from './types/index.js'
import { Data } from 'effect'

/**
 * Base Galaxy API Error
 * Used for generic API errors without domain specificity.
 */
export class GalaxyApiError extends Data.TaggedError('GalaxyApiError')<{
  readonly message: string
  readonly statusCode?: number
  readonly cause?: unknown
}> {}

/**
 * Workflow-specific error
 */
export class WorkflowError extends Data.TaggedError('WorkflowError')<{
  readonly message: string
  readonly workflowId?: string
  readonly statusCode?: number
  readonly cause?: unknown
}> {}

/**
 * History-specific error
 */
export class HistoryError extends Data.TaggedError('HistoryError')<{
  readonly message: string
  readonly historyId?: string
  readonly statusCode?: number
  readonly cause?: unknown
}> {}

/**
 * Dataset-specific error
 */
export class DatasetError extends Data.TaggedError('DatasetError')<{
  readonly message: string
  readonly datasetId?: string
  readonly historyId?: string
  readonly statusCode?: number
  readonly cause?: unknown
}> {}

/**
 * Tool-specific error
 */
export class ToolError extends Data.TaggedError('ToolError')<{
  readonly message: string
  readonly toolId?: string
  readonly statusCode?: number
  readonly cause?: unknown
}> {}

/**
 * Job-specific error
 */
export class JobError extends Data.TaggedError('JobError')<{
  readonly message: string
  readonly jobId?: string
  readonly statusCode?: number
  readonly cause?: unknown
}> {}

/**
 * Invocation-specific error
 */
export class InvocationError extends Data.TaggedError('InvocationError')<{
  readonly message: string
  readonly invocationId?: string
  readonly statusCode?: number
  readonly cause?: unknown
}> {}

/**
 * Configuration error
 */
export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Type guards for error identification
 */
export function isGalaxyApiError(error: unknown): error is GalaxyApiError {
  return error instanceof GalaxyApiError
}

export function isWorkflowError(error: unknown): error is WorkflowError {
  return error instanceof WorkflowError
}

export function isHistoryError(error: unknown): error is HistoryError {
  return error instanceof HistoryError
}

export function isDatasetError(error: unknown): error is DatasetError {
  return error instanceof DatasetError
}

export function isToolError(error: unknown): error is ToolError {
  return error instanceof ToolError
}

export function isJobError(error: unknown): error is JobError {
  return error instanceof JobError
}

export function isInvocationError(error: unknown): error is InvocationError {
  return error instanceof InvocationError
}

export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError
}

/**
 * Extract HTTP status code from various error types.
 * Works with ofetch FetchError and other standard HTTP errors.
 */
export function extractStatusCode(error: unknown): number | undefined {
  // ofetch FetchError has statusCode property
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>

    if (typeof err.statusCode === 'number')
      return err.statusCode

    if (typeof err.status === 'number')
      return err.status

    // Check for nested error (e.g., in cause chain)
    if (err.cause && typeof err.cause === 'object') {
      const cause = err.cause as Record<string, unknown>
      if (typeof cause.statusCode === 'number')
        return cause.statusCode
      if (typeof cause.status === 'number')
        return cause.status
    }
  }

  return undefined
}

/**
 * Helper to create error message with context.
 */
export function formatErrorMessage(
  resourceType: string,
  resourceId: string | undefined,
  action: string,
  cause: unknown,
): string {
  const resource = resourceId ? ` ${resourceId}` : ''
  const causeMessage = cause instanceof Error ? cause.message : String(cause)
  return `${action} ${resourceType}${resource}: ${causeMessage}`
}

// Legacy exports for backward compatibility
export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof (error as Record<string, unknown>).message === 'string'
  )
}

export function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
  if (isErrorWithMessage(maybeError))
    return maybeError

  try {
    return new Error(JSON.stringify(maybeError))
  }
  catch {
    return new Error(String(maybeError))
  }
}

export function getErrorMessage(error: unknown): string {
  return toErrorWithMessage(error).message
}

export function isErrorWithStatus(error: unknown): error is ErrorWithStatus {
  return (
    typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof (error as Record<string, unknown>).statusCode === 'number'
  )
}

export function toErrorWithStatus(maybeError: unknown, fallback: number): ErrorWithStatus {
  if (isErrorWithStatus(maybeError)) {
    return maybeError
  }
  return { statusCode: fallback }
}

export function getStatusCode(error: unknown, fallback: number = 500): number {
  return toErrorWithStatus(error, fallback).statusCode
}
