/**
 * Commercial calculation utilities.
 *
 * Provides deterministic line total and document total computation
 * with half-up rounding to 2 decimal places.
 *
 * Line total formula (sales/quotes): (quantity × unitPrice) - discountAmount
 * Line total formula (purchase orders): (quantity × unitCost) - discountAmount
 * Document totals: subtotal (sum of qty×price), discountAmount (sum of discounts),
 *   taxAmount (sum of taxes), totalAmount = subtotal - discountAmount + taxAmount
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentTotals {
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
}

export interface DocumentItem {
  readonly quantity: number
  readonly unitPrice: number
  readonly discountAmount: number
  readonly taxAmount: number
}

// ---------------------------------------------------------------------------
// Rounding
// ---------------------------------------------------------------------------

/**
 * Rounds a number to the specified decimal places using half-up strategy.
 *
 * Uses exponential notation to avoid floating-point representation issues
 * (e.g., 1.005 rounds to 1.01 instead of 1.00).
 */
export function roundHalfUp(value: number, decimals: number): number {
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals)
}

// ---------------------------------------------------------------------------
// Line totals
// ---------------------------------------------------------------------------

/**
 * Computes the line total for a sales/quote item.
 *
 * Formula: (quantity × unitPrice) - discountAmount
 * Rounded to 2 decimal places (half-up).
 */
export function computeSalesLineTotal(quantity: number, unitPrice: number, discountAmount: number): number {
  const raw = quantity * unitPrice - discountAmount
  return roundHalfUp(raw, 2)
}

/**
 * Computes the line total for a purchase order item.
 *
 * Formula: (quantity × unitCost) - discountAmount
 * Rounded to 2 decimal places (half-up).
 */
export function computePurchaseLineTotal(quantity: number, unitCost: number, discountAmount: number): number {
  const raw = quantity * unitCost - discountAmount
  return roundHalfUp(raw, 2)
}

// ---------------------------------------------------------------------------
// Document totals
// ---------------------------------------------------------------------------

/**
 * Computes document totals from an array of item rows.
 *
 * - subtotal = sum of (quantity × unitPrice) for each item, rounded to 2 decimals
 * - discountAmount = sum of item discountAmount values, rounded to 2 decimals
 * - taxAmount = sum of item taxAmount values, rounded to 2 decimals
 * - totalAmount = subtotal - discountAmount + taxAmount, rounded to 2 decimals
 */
export function computeDocumentTotals(items: readonly DocumentItem[]): DocumentTotals {
  const subtotal = roundHalfUp(
    items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    2
  )
  const discountAmount = roundHalfUp(
    items.reduce((sum, item) => sum + item.discountAmount, 0),
    2
  )
  const taxAmount = roundHalfUp(
    items.reduce((sum, item) => sum + item.taxAmount, 0),
    2
  )
  const totalAmount = roundHalfUp(subtotal - discountAmount + taxAmount, 2)

  return { subtotal, discountAmount, taxAmount, totalAmount }
}
