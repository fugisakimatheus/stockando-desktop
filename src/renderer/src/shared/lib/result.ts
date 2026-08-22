/**
 * Type-safe Result pattern for operations where failure is expected.
 *
 * Use this for mutation callbacks, form validation, or any operation where you
 * want to handle success/failure without try/catch at the call site.
 *
 * @example
 * ```ts
 * const result = await parseForm(data)
 * if (!result.ok) {
 *   setFieldErrors(result.error.fields)
 *   return
 * }
 * submit(result.value)
 * ```
 */

interface Success<T> {
  readonly ok: true
  readonly value: T
}

interface Failure<E> {
  readonly ok: false
  readonly error: E
}

type Result<T, E = Error> = Success<T> | Failure<E>

/**
 * Creates a successful Result wrapping the given value.
 */
function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

/**
 * Creates a failed Result wrapping the given error.
 */
function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

export { err, ok }
export type { Failure, Result, Success }
