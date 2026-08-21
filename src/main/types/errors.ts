/**
 * Re-export of the application error hierarchy from the canonical location.
 *
 * All error codes and classes are defined in `src/main/api/errors.ts`.
 * This barrel export provides convenient access from the types layer.
 */

export {
  ERROR_CODES,
  type ErrorCode,
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  InsufficientStockError,
  EntityReferencedError,
  InvalidMovementError,
  TransferSameWarehouseError,
  InvalidStatusTransitionError,
  InvalidAccessKeyError,
  SystemError,
  InstallmentSumMismatchError,
  OrderHasActiveFiscalDocError,
  SeriesNotConfiguredError,
  DuplicateFiscalDocumentError,
  InvalidSettlementAmountError,
  FiscalDocumentNotDraftError,
  FiscalDocumentNotAuthorizedError
} from '../api/errors'
