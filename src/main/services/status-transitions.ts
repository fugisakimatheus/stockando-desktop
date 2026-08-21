/**
 * Status transition validation utilities for commercial documents.
 *
 * Defines valid status transitions for quotes, sales orders, and purchase orders
 * as const records, and provides a generic validateTransition function using ts-pattern.
 *
 * Requirements: 4.1, 4.2, 7.1, 7.2, 8.6, 8.7
 */

import { match } from 'ts-pattern'

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

export const QUOTE_STATUSES = {
  draft: 'draft',
  sent: 'sent',
  accepted: 'accepted',
  rejected: 'rejected',
  converted: 'converted',
  cancelled: 'cancelled'
} as const satisfies Record<string, string>

export type QuoteStatus = (typeof QUOTE_STATUSES)[keyof typeof QUOTE_STATUSES]

export const SALES_ORDER_STATUSES = {
  draft: 'draft',
  confirmed: 'confirmed',
  partially_fulfilled: 'partially_fulfilled',
  fulfilled: 'fulfilled',
  cancelled: 'cancelled'
} as const satisfies Record<string, string>

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[keyof typeof SALES_ORDER_STATUSES]

export const PURCHASE_ORDER_STATUSES = {
  draft: 'draft',
  sent: 'sent',
  partially_received: 'partially_received',
  received: 'received',
  cancelled: 'cancelled'
} as const satisfies Record<string, string>

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[keyof typeof PURCHASE_ORDER_STATUSES]

export const PAYMENT_STATUSES = {
  unpaid: 'unpaid',
  partially_paid: 'partially_paid',
  paid: 'paid'
} as const satisfies Record<string, string>

export type PaymentStatus = (typeof PAYMENT_STATUSES)[keyof typeof PAYMENT_STATUSES]

// ---------------------------------------------------------------------------
// Valid transition maps
// ---------------------------------------------------------------------------

/**
 * Quote lifecycle transitions:
 * draft → sent | cancelled
 * sent → accepted | rejected | cancelled
 * accepted → converted
 * rejected, converted, cancelled → (terminal)
 */
export const VALID_QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['accepted', 'rejected', 'cancelled'],
  accepted: ['converted'],
  rejected: [],
  converted: [],
  cancelled: []
} as const

/**
 * Sales order lifecycle transitions:
 * draft → confirmed | cancelled
 * confirmed → partially_fulfilled | fulfilled | cancelled
 * partially_fulfilled → fulfilled
 * fulfilled, cancelled → (terminal)
 */
export const VALID_SALES_ORDER_TRANSITIONS: Record<SalesOrderStatus, readonly SalesOrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['partially_fulfilled', 'fulfilled', 'cancelled'],
  partially_fulfilled: ['fulfilled'],
  fulfilled: [],
  cancelled: []
} as const

/**
 * Purchase order lifecycle transitions:
 * draft → sent | cancelled
 * sent → partially_received | received | cancelled
 * partially_received → received
 * received, cancelled → (terminal)
 */
export const VALID_PURCHASE_ORDER_TRANSITIONS: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['partially_received', 'received', 'cancelled'],
  partially_received: ['received'],
  received: [],
  cancelled: []
} as const

// ---------------------------------------------------------------------------
// Transition validation result
// ---------------------------------------------------------------------------

export type TransitionResult<T extends string> =
  | { valid: true }
  | { valid: false; currentStatus: T; allowed: readonly T[] }

// ---------------------------------------------------------------------------
// Validation function
// ---------------------------------------------------------------------------

/**
 * Validates whether a status transition is permitted according to the given
 * transition map. Uses ts-pattern for exhaustive matching on the validation
 * outcome.
 *
 * @param currentStatus - The document's current status
 * @param targetStatus - The requested new status
 * @param validTransitions - Record mapping each status to its valid targets
 * @returns A discriminated result: `{ valid: true }` on success, or
 *          `{ valid: false, currentStatus, allowed }` on rejection
 */
export function validateTransition<T extends string>(
  currentStatus: T,
  targetStatus: T,
  validTransitions: Record<T, readonly T[]>
): TransitionResult<T> {
  const allowed = validTransitions[currentStatus]

  return match(allowed.includes(targetStatus))
    .with(true, () => ({ valid: true }) as TransitionResult<T>)
    .with(false, () => ({ valid: false, currentStatus, allowed }) as TransitionResult<T>)
    .exhaustive()
}
