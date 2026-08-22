/**
 * Result-based API fetch wrapper.
 *
 * Provides `tryFetch` — a wrapper around `apiClient` that catches errors and
 * returns a `Result<T, ApiError>` instead of throwing.
 *
 * Use this in contexts where you want to handle failure inline without
 * try/catch (form submissions, conditional logic, pre-validation calls).
 *
 * For TanStack Query hooks, continue using `apiClient` directly — React Query
 * handles errors via its own error state.
 *
 * @example
 * ```ts
 * import { tryFetch } from '@shared/lib/api-result'
 *
 * const result = await tryFetch(() => createProduct(companyId, input))
 *
 * if (!result.ok) {
 *   if (result.error.fields) {
 *     setFieldErrors(result.error.fields)
 *   } else {
 *     toast.error(getUserErrorMessage(result.error.code))
 *   }
 *   return
 * }
 *
 * toast.success('Produto criado com sucesso')
 * onClose(result.value)
 * ```
 */

import { ApiError } from '@shared/api/client'

import type { Result } from './result'
import { err, ok } from './result'

/**
 * Executes an async API call and wraps the outcome in a Result.
 *
 * - On success: returns `{ ok: true, value: T }`
 * - On ApiError: returns `{ ok: false, error: ApiError }`
 * - On unknown error: wraps it in a generic ApiError with code 'UNKNOWN_ERROR'
 */
async function tryFetch<T>(fn: () => Promise<T>): Promise<Result<T, ApiError>> {
  try {
    const data = await fn()
    return ok(data)
  } catch (error) {
    if (error instanceof ApiError) {
      return err(error)
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return err(new ApiError('UNKNOWN_ERROR', message))
  }
}

/**
 * Type guard that checks if an error is an ApiError with a specific code.
 *
 * @example
 * ```ts
 * if (isApiErrorWithCode(result.error, 'CONFLICT')) {
 *   setFieldErrors({ sku: 'SKU já existe' })
 * }
 * ```
 */
function isApiErrorWithCode(error: unknown, code: string): error is ApiError {
  return error instanceof ApiError && error.code === code
}

export { isApiErrorWithCode, tryFetch }
