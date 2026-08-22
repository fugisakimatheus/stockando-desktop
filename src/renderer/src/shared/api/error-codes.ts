/**
 * Type-safe API error code definitions and user-facing message resolution.
 *
 * Mirrors the error codes from `src/main/api/errors.ts` plus renderer-side
 * codes (NETWORK_ERROR, PARSE_ERROR). Provides a single source of truth for
 * all known error codes in the renderer and a ts-pattern based message
 * resolver for consistent user-facing feedback.
 *
 * @example
 * ```ts
 * import { getUserErrorMessage, type ApiErrorCode } from '@shared/api/error-codes'
 *
 * const message = getUserErrorMessage(error.code)
 * toast.error(message)
 * ```
 */

import { match } from 'ts-pattern'

// ---------------------------------------------------------------------------
// Error Code Registry
// ---------------------------------------------------------------------------

/**
 * All known API error codes in the system.
 * Mirrors `src/main/api/errors.ts` + client-side codes.
 */
const API_ERROR_CODES = {
  // Client-side (renderer)
  NETWORK_ERROR: 'NETWORK_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',

  // Server-side — General
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  SYSTEM_ERROR: 'SYSTEM_ERROR',

  // Server-side — Business Rules
  BUSINESS_RULE_ERROR: 'BUSINESS_RULE_ERROR',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  ENTITY_REFERENCED: 'ENTITY_REFERENCED',
  INVALID_MOVEMENT: 'INVALID_MOVEMENT',
  TRANSFER_SAME_WAREHOUSE: 'TRANSFER_SAME_WAREHOUSE',

  // Server-side — Finance & Fiscal
  INSTALLMENT_SUM_MISMATCH: 'INSTALLMENT_SUM_MISMATCH',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  INVALID_ACCESS_KEY: 'INVALID_ACCESS_KEY',
  ORDER_HAS_ACTIVE_FISCAL_DOC: 'ORDER_HAS_ACTIVE_FISCAL_DOC',
  SERIES_NOT_CONFIGURED: 'SERIES_NOT_CONFIGURED',
  DUPLICATE_FISCAL_DOCUMENT: 'DUPLICATE_FISCAL_DOCUMENT',
  INVALID_SETTLEMENT_AMOUNT: 'INVALID_SETTLEMENT_AMOUNT',
  FISCAL_DOCUMENT_NOT_DRAFT: 'FISCAL_DOCUMENT_NOT_DRAFT',
  FISCAL_DOCUMENT_NOT_AUTHORIZED: 'FISCAL_DOCUMENT_NOT_AUTHORIZED'
} as const

type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]

// ---------------------------------------------------------------------------
// User-Facing Message Resolution
// ---------------------------------------------------------------------------

/**
 * Maps an error code to a user-friendly message in pt-BR.
 *
 * Uses ts-pattern for exhaustive, maintainable matching.
 * Returns the server message as fallback if the code is unrecognized.
 */
function getUserErrorMessage(code: string, serverMessage?: string): string {
  return (
    match(code)
      // Client-side
      .with('NETWORK_ERROR', () => 'Não foi possível conectar ao servidor. Verifique sua conexão.')
      .with('PARSE_ERROR', () => 'Erro ao processar a resposta do servidor.')

      // General
      .with('VALIDATION_ERROR', () => 'Verifique os dados informados e tente novamente.')
      .with('NOT_FOUND', () => 'O registro solicitado não foi encontrado.')
      .with('CONFLICT', () => 'Já existe um registro com estes dados.')
      .with('SYSTEM_ERROR', () => 'Ocorreu um erro interno. Tente novamente mais tarde.')

      // Business Rules
      .with('BUSINESS_RULE_ERROR', () => serverMessage ?? 'Operação não permitida pelas regras de negócio.')
      .with('INSUFFICIENT_STOCK', () => 'Estoque insuficiente para realizar esta operação.')
      .with('ENTITY_REFERENCED', () => 'Este registro não pode ser removido pois está em uso.')
      .with('INVALID_MOVEMENT', () => 'Este produto não possui controle de estoque ativo.')
      .with('TRANSFER_SAME_WAREHOUSE', () => 'Os armazéns de origem e destino devem ser diferentes.')

      // Finance & Fiscal
      .with('INSTALLMENT_SUM_MISMATCH', () => 'A soma das parcelas não corresponde ao valor total.')
      .with('INVALID_STATUS_TRANSITION', () => 'Transição de status inválida para este documento.')
      .with('INVALID_ACCESS_KEY', () => 'Chave de acesso inválida.')
      .with('ORDER_HAS_ACTIVE_FISCAL_DOC', () => 'Este pedido já possui um documento fiscal ativo.')
      .with('SERIES_NOT_CONFIGURED', () => 'Série fiscal não configurada. Configure nas configurações da empresa.')
      .with('DUPLICATE_FISCAL_DOCUMENT', () => 'Já existe um documento fiscal com estes dados.')
      .with('INVALID_SETTLEMENT_AMOUNT', () => 'O valor de liquidação informado é inválido.')
      .with('FISCAL_DOCUMENT_NOT_DRAFT', () => 'Apenas documentos em rascunho podem ser editados.')
      .with('FISCAL_DOCUMENT_NOT_AUTHORIZED', () => 'Documento fiscal não está autorizado.')

      // Fallback for unknown codes
      .otherwise(() => serverMessage ?? 'Ocorreu um erro inesperado. Tente novamente.')
  )
}

/**
 * Checks if a given string is a known API error code.
 * Useful as a type guard.
 */
function isKnownErrorCode(code: string): code is ApiErrorCode {
  return Object.values(API_ERROR_CODES).includes(code as ApiErrorCode)
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { API_ERROR_CODES, getUserErrorMessage, isKnownErrorCode }
export type { ApiErrorCode }
