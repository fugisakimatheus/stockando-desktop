/**
 * Application error hierarchy.
 *
 * Service-layer code throws these typed errors. The Fastify error handler
 * maps each subclass to an HTTP status code and a structured response.
 */

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  BUSINESS_RULE_ERROR: 'BUSINESS_RULE_ERROR',
  SYSTEM_ERROR: 'SYSTEM_ERROR'
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/**
 * Base class for all application errors. Never throw raw `Error` or expose
 * internal details (e.g., SQLite messages) to the renderer.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number

  constructor(message: string, code: ErrorCode, statusCode: number) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
  }
}

/**
 * 400 — Invalid input or missing required fields.
 * Supports an optional `fields` map for per-field validation messages.
 */
export class ValidationError extends AppError {
  readonly fields?: Record<string, string>

  constructor(message: string, fields?: Record<string, string>) {
    super(message, ERROR_CODES.VALIDATION_ERROR, 400)
    this.name = 'ValidationError'
    this.fields = fields
  }
}

/**
 * 404 — Entity not found within the current company scope.
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, ERROR_CODES.NOT_FOUND, 404)
    this.name = 'NotFoundError'
  }
}

/**
 * 409 — Duplicate natural key or conflicting state.
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, ERROR_CODES.CONFLICT, 409)
    this.name = 'ConflictError'
  }
}

/**
 * 422 — Business rule violation (invalid status transition, insufficient stock, etc.).
 */
export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(message, ERROR_CODES.BUSINESS_RULE_ERROR, 422)
    this.name = 'BusinessRuleError'
  }
}

/**
 * 500 — Unexpected internal failure. The original error message is logged
 * server-side but never exposed to the renderer.
 */
export class SystemError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super(message, ERROR_CODES.SYSTEM_ERROR, 500)
    this.name = 'SystemError'
  }
}
