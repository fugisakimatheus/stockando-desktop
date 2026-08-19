import type { ErrorCode } from './errors'

/**
 * Standard API response envelope for successful operations.
 */
export interface ApiResponse<T> {
  data: T
  success: true
}

/**
 * Standard API error response envelope. Never exposes raw internal errors.
 */
export interface ApiErrorResponse {
  success: false
  error: {
    /** Machine-readable error code */
    code: ErrorCode
    /** Human-readable description safe to display */
    message: string
    /** Per-field validation errors (present on VALIDATION_ERROR) */
    fields?: Record<string, string>
  }
}

/**
 * Union type representing any API response (success or error).
 */
export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse

/**
 * Helper to build a success envelope.
 */
export function ok<T>(data: T): ApiResponse<T> {
  return { data, success: true }
}

/**
 * Helper to build an error envelope.
 */
export function err(code: ErrorCode, message: string, fields?: Record<string, string>): ApiErrorResponse {
  const response: ApiErrorResponse = {
    success: false,
    error: { code, message }
  }

  if (fields) {
    response.error.fields = fields
  }

  return response
}
