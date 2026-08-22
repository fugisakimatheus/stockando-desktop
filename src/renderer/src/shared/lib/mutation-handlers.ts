/**
 * Mutation error-handling utilities.
 *
 * Eliminates the repeated onError boilerplate across pages:
 * - Check if error is ApiError with field-level errors → set field errors
 * - Check for known codes (CONFLICT, VALIDATION_ERROR) → set specific field messages
 * - Otherwise → show a generic toast error via getUserErrorMessage
 *
 * @example
 * ```ts
 * const { handleMutationError } = useMutationHandlers({ setFieldErrors })
 *
 * createProduct.mutate(input, {
 *   onSuccess: () => {
 *     toast.success('Produto criado com sucesso')
 *     close()
 *   },
 *   onError: handleMutationError('Erro ao criar produto')
 * })
 * ```
 */

import { ApiError, getUserErrorMessage } from '@shared/api'
import { toast } from 'sonner'

interface MutationHandlersOptions {
  /** Setter for per-field validation errors displayed in forms. */
  setFieldErrors: (errors: Record<string, string>) => void
}

interface MutationHandlers {
  /**
   * Returns an `onError` callback suitable for `useMutation`.
   *
   * @param fallbackMessage - Generic toast message shown when the error has no field details.
   * @param fieldOverrides - Map of error codes to specific field error messages.
   *   Example: `{ CONFLICT: { sku: 'Já existe um produto com este SKU.' } }`
   */
  handleMutationError: (
    fallbackMessage: string,
    fieldOverrides?: Record<string, Record<string, string>>
  ) => (error: Error) => void
}

/**
 * Creates reusable mutation error handlers with field-error awareness.
 */
function useMutationHandlers({ setFieldErrors }: MutationHandlersOptions): MutationHandlers {
  function handleMutationError(
    fallbackMessage: string,
    fieldOverrides?: Record<string, Record<string, string>>
  ): (error: Error) => void {
    return (error: Error) => {
      if (!(error instanceof ApiError)) {
        toast.error(fallbackMessage)
        return
      }

      // Server returned per-field validation errors
      if (error.fields) {
        setFieldErrors(error.fields)
        return
      }

      // Check for code-specific field overrides
      if (fieldOverrides && error.code in fieldOverrides) {
        setFieldErrors(fieldOverrides[error.code])
        return
      }

      // Resolve a user-friendly message via the error code map
      toast.error(getUserErrorMessage(error.code, error.message))
    }
  }

  return { handleMutationError }
}

export { useMutationHandlers }
export type { MutationHandlers, MutationHandlersOptions }
