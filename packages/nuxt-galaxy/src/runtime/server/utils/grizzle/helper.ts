import { createError } from 'h3'

export function takeUniqueOrThrow<T extends unknown[]>(values: T) {
  if (values.length > 1) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Found non unique',
    })
  }
  if (values.length === 1) {
    return values[0]! as T[0]
  }
  return null
}
