/**
 * Fiscal document status transition validation and access key utilities.
 *
 * Defines valid status transitions for fiscal documents (NF-e / NFC-e),
 * provides transition validation using ts-pattern, and validates the
 * 44-digit access key format required by SEFAZ.
 *
 * Requirements: 5.3, 5.4, 5.5
 */

import { match } from 'ts-pattern'

import { InvalidAccessKeyError, InvalidStatusTransitionError } from '../api/errors'
import type { FiscalDocumentStatus } from '../types/finance'
import { FISCAL_DOCUMENT_STATUSES } from '../types/finance'

// ---------------------------------------------------------------------------
// Valid transition map
// ---------------------------------------------------------------------------

/**
 * Fiscal document lifecycle transitions:
 * draft → authorized | denied
 * authorized → cancelled
 * denied, cancelled → (terminal)
 */
export const VALID_FISCAL_TRANSITIONS: Record<FiscalDocumentStatus, readonly FiscalDocumentStatus[]> = {
  [FISCAL_DOCUMENT_STATUSES.draft]: [FISCAL_DOCUMENT_STATUSES.authorized, FISCAL_DOCUMENT_STATUSES.denied],
  [FISCAL_DOCUMENT_STATUSES.authorized]: [FISCAL_DOCUMENT_STATUSES.cancelled],
  [FISCAL_DOCUMENT_STATUSES.cancelled]: [],
  [FISCAL_DOCUMENT_STATUSES.denied]: []
} as const

// ---------------------------------------------------------------------------
// Access key validation
// ---------------------------------------------------------------------------

const ACCESS_KEY_PATTERN = /^\d{44}$/

/**
 * Validates whether an access key follows the 44-digit numeric format
 * required by SEFAZ (chave de acesso).
 *
 * @param accessKey - The access key string to validate
 * @returns `true` if the key is exactly 44 numeric digits, `false` otherwise
 */
export function validateAccessKey(accessKey: string): boolean {
  return ACCESS_KEY_PATTERN.test(accessKey)
}

/**
 * Asserts that the access key follows the 44-digit numeric format.
 * Throws `InvalidAccessKeyError` if validation fails.
 *
 * @param accessKey - The access key string to validate
 * @throws {InvalidAccessKeyError} when the key does not match the required format
 */
export function assertValidAccessKey(accessKey: string): void {
  if (!validateAccessKey(accessKey)) {
    throw new InvalidAccessKeyError(accessKey)
  }
}

// ---------------------------------------------------------------------------
// Status transition validation
// ---------------------------------------------------------------------------

/**
 * Validates whether a fiscal document status transition is permitted
 * according to the lifecycle rules. Uses ts-pattern for exhaustive matching.
 *
 * @param currentStatus - The document's current fiscal status
 * @param targetStatus - The requested new status
 * @returns `true` if the transition is valid, `false` otherwise
 */
export function validateFiscalTransition(
  currentStatus: FiscalDocumentStatus,
  targetStatus: FiscalDocumentStatus
): boolean {
  const allowed = VALID_FISCAL_TRANSITIONS[currentStatus]

  return match(allowed.includes(targetStatus))
    .with(true, () => true)
    .with(false, () => false)
    .exhaustive()
}

/**
 * Asserts that a fiscal document status transition is valid.
 * Throws `InvalidStatusTransitionError` if the transition is not permitted.
 *
 * @param currentStatus - The document's current fiscal status
 * @param targetStatus - The requested new status
 * @throws {InvalidStatusTransitionError} when the transition is not allowed
 */
export function assertFiscalTransition(currentStatus: FiscalDocumentStatus, targetStatus: FiscalDocumentStatus): void {
  const allowed = VALID_FISCAL_TRANSITIONS[currentStatus]

  match(allowed.includes(targetStatus))
    .with(true, () => {})
    .with(false, () => {
      throw new InvalidStatusTransitionError(currentStatus, targetStatus, allowed)
    })
    .exhaustive()
}
