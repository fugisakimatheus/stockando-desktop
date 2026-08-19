/**
 * Audit timestamp utilities for consistent timestamp handling across all
 * database operations. All timestamps are stored as ISO 8601 strings.
 */

/**
 * Returns the current time as an ISO 8601 string.
 */
export function nowISO(): string {
  return new Date().toISOString()
}

/**
 * Adds `createdAt` and `updatedAt` fields (both set to the current time)
 * to the given data object. Use when inserting new records.
 */
export function withCreatedAt<T extends Record<string, unknown>>(
  data: T
): T & { createdAt: string; updatedAt: string } {
  const now = nowISO()
  return { ...data, createdAt: now, updatedAt: now }
}

/**
 * Adds an `updatedAt` field set to the current time to the given data object.
 * Use when updating existing records — `createdAt` remains unchanged.
 */
export function withUpdatedAt<T extends Record<string, unknown>>(data: T): T & { updatedAt: string } {
  return { ...data, updatedAt: nowISO() }
}
