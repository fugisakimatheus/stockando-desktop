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
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  ENTITY_REFERENCED: 'ENTITY_REFERENCED',
  INVALID_MOVEMENT: 'INVALID_MOVEMENT',
  TRANSFER_SAME_WAREHOUSE: 'TRANSFER_SAME_WAREHOUSE',
  SYSTEM_ERROR: 'SYSTEM_ERROR',

  // Phase 3 — Finance & Fiscal
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
  constructor(message: string, code: ErrorCode = ERROR_CODES.BUSINESS_RULE_ERROR) {
    super(message, code, 422)
    this.name = 'BusinessRuleError'
  }
}

/**
 * 422 — Stock operation would cause negative balance.
 */
export class InsufficientStockError extends BusinessRuleError {
  constructor(message = 'Insufficient stock for this operation') {
    super(message, ERROR_CODES.INSUFFICIENT_STOCK)
    this.name = 'InsufficientStockError'
  }
}

/**
 * 422 — Entity cannot be deleted because it is referenced by other records.
 */
export class EntityReferencedError extends BusinessRuleError {
  constructor(message = 'Cannot delete entity because it is referenced by other records') {
    super(message, ERROR_CODES.ENTITY_REFERENCED)
    this.name = 'EntityReferencedError'
  }
}

/**
 * 422 — Product does not have trackInventory enabled.
 */
export class InvalidMovementError extends BusinessRuleError {
  constructor(message = 'Product does not track inventory') {
    super(message, ERROR_CODES.INVALID_MOVEMENT)
    this.name = 'InvalidMovementError'
  }
}

/**
 * 422 — Transfer source and destination warehouses are the same.
 */
export class TransferSameWarehouseError extends BusinessRuleError {
  constructor(message = 'Source and destination warehouses must be different') {
    super(message, ERROR_CODES.TRANSFER_SAME_WAREHOUSE)
    this.name = 'TransferSameWarehouseError'
  }
}

/**
 * 422 — Invalid status transition for a fiscal document or commercial order.
 */
export class InvalidStatusTransitionError extends BusinessRuleError {
  readonly currentStatus: string
  readonly targetStatus: string
  readonly allowed: readonly string[]

  constructor(currentStatus: string, targetStatus: string, allowed: readonly string[]) {
    super(
      `Invalid status transition from "${currentStatus}" to "${targetStatus}". Allowed: [${allowed.join(', ')}]`,
      ERROR_CODES.INVALID_STATUS_TRANSITION
    )
    this.name = 'InvalidStatusTransitionError'
    this.currentStatus = currentStatus
    this.targetStatus = targetStatus
    this.allowed = allowed
  }
}

/**
 * 422 — Invalid access key format (must be exactly 44 numeric digits).
 */
export class InvalidAccessKeyError extends BusinessRuleError {
  constructor(accessKey: string) {
    super(
      `Invalid access key format: "${accessKey}". Must be exactly 44 numeric digits.`,
      ERROR_CODES.INVALID_ACCESS_KEY
    )
    this.name = 'InvalidAccessKeyError'
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

// ─── Phase 3 — Finance & Fiscal Error Subclasses ─────────────────────────────

/**
 * 422 — Payment plan installment amounts do not sum to the order document total.
 */
export class InstallmentSumMismatchError extends BusinessRuleError {
  constructor(message = 'Installment amounts do not sum to the order document total') {
    super(message, ERROR_CODES.INSTALLMENT_SUM_MISMATCH)
    this.name = 'InstallmentSumMismatchError'
  }
}

/**
 * 422 — Order cannot be cancelled because it has an active (authorized) fiscal document.
 */
export class OrderHasActiveFiscalDocError extends BusinessRuleError {
  constructor(message = 'Order has an active fiscal document that must be cancelled first') {
    super(message, ERROR_CODES.ORDER_HAS_ACTIVE_FISCAL_DOC)
    this.name = 'OrderHasActiveFiscalDocError'
  }
}

/**
 * 422 — Document series is not configured for the given company, type, and series.
 */
export class SeriesNotConfiguredError extends BusinessRuleError {
  constructor(message = 'Document series is not configured for this company and document type') {
    super(message, ERROR_CODES.SERIES_NOT_CONFIGURED)
    this.name = 'SeriesNotConfiguredError'
  }
}

/**
 * 409 — A non-cancelled fiscal document of the same type already exists for the order.
 */
export class DuplicateFiscalDocumentError extends AppError {
  constructor(message = 'An active fiscal document of this type already exists for the order') {
    super(message, ERROR_CODES.DUPLICATE_FISCAL_DOCUMENT, 409)
    this.name = 'DuplicateFiscalDocumentError'
  }
}

/**
 * 422 — Settlement amount is zero or negative.
 */
export class InvalidSettlementAmountError extends BusinessRuleError {
  constructor(message = 'Settlement amount must be greater than zero') {
    super(message, ERROR_CODES.INVALID_SETTLEMENT_AMOUNT)
    this.name = 'InvalidSettlementAmountError'
  }
}

/**
 * 422 — Fiscal document authorization requires the document to be in "draft" status.
 */
export class FiscalDocumentNotDraftError extends BusinessRuleError {
  constructor(message = 'Fiscal document must be in draft status for this operation') {
    super(message, ERROR_CODES.FISCAL_DOCUMENT_NOT_DRAFT)
    this.name = 'FiscalDocumentNotDraftError'
  }
}

/**
 * 422 — Fiscal document cancellation requires the document to be in "authorized" status.
 */
export class FiscalDocumentNotAuthorizedError extends BusinessRuleError {
  constructor(message = 'Fiscal document must be in authorized status for this operation') {
    super(message, ERROR_CODES.FISCAL_DOCUMENT_NOT_AUTHORIZED)
    this.name = 'FiscalDocumentNotAuthorizedError'
  }
}
