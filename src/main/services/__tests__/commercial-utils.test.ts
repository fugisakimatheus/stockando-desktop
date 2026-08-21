/**
 * Unit tests for commercial calculation utilities.
 *
 * Tests cover:
 * - roundHalfUp correctness for various edge cases
 * - computeSalesLineTotal formula and rounding
 * - computePurchaseLineTotal formula and rounding
 * - computeDocumentTotals aggregation logic
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
 */
import { describe, expect, it } from 'vitest'

import {
  computeDocumentTotals,
  computePurchaseLineTotal,
  computeSalesLineTotal,
  roundHalfUp
} from '../commercial-utils'

describe('roundHalfUp', () => {
  it('rounds 1.005 up to 1.01 (2 decimals)', () => {
    expect(roundHalfUp(1.005, 2)).toBe(1.01)
  })

  it('rounds 1.004 down to 1.00 (2 decimals)', () => {
    expect(roundHalfUp(1.004, 2)).toBe(1.0)
  })

  it('rounds 2.555 up to 2.56 (2 decimals)', () => {
    expect(roundHalfUp(2.555, 2)).toBe(2.56)
  })

  it('rounds 0.1 + 0.2 correctly', () => {
    expect(roundHalfUp(0.1 + 0.2, 2)).toBe(0.3)
  })

  it('handles zero', () => {
    expect(roundHalfUp(0, 2)).toBe(0)
  })

  it('handles negative values', () => {
    expect(roundHalfUp(-1.005, 2)).toBe(-1.0)
  })

  it('rounds to 0 decimals', () => {
    expect(roundHalfUp(2.5, 0)).toBe(3)
    expect(roundHalfUp(2.4, 0)).toBe(2)
  })

  it('rounds to 3 decimals', () => {
    expect(roundHalfUp(1.2345, 3)).toBe(1.235)
    expect(roundHalfUp(1.2344, 3)).toBe(1.234)
  })
})

describe('computeSalesLineTotal', () => {
  it('computes (quantity × unitPrice) - discountAmount', () => {
    // 10 × 5.50 - 2.00 = 53.00
    expect(computeSalesLineTotal(10, 5.5, 2)).toBe(53.0)
  })

  it('rounds the result to 2 decimal places', () => {
    // 3 × 1.33 - 0 = 3.99
    expect(computeSalesLineTotal(3, 1.33, 0)).toBe(3.99)
  })

  it('handles zero discount', () => {
    // 2 × 10.00 - 0 = 20.00
    expect(computeSalesLineTotal(2, 10, 0)).toBe(20.0)
  })

  it('handles fractional quantities', () => {
    // 1.5 × 10.00 - 1.00 = 14.00
    expect(computeSalesLineTotal(1.5, 10, 1)).toBe(14.0)
  })

  it('handles result requiring rounding', () => {
    // 7 × 3.33 - 0.50 = 23.31 - 0.50 = 22.81
    expect(computeSalesLineTotal(7, 3.33, 0.5)).toBe(22.81)
  })

  it('can produce negative when discount exceeds gross', () => {
    // 1 × 5.00 - 10.00 = -5.00
    expect(computeSalesLineTotal(1, 5, 10)).toBe(-5.0)
  })
})

describe('computePurchaseLineTotal', () => {
  it('computes (quantity × unitCost) - discountAmount', () => {
    // 20 × 4.25 - 5.00 = 80.00
    expect(computePurchaseLineTotal(20, 4.25, 5)).toBe(80.0)
  })

  it('rounds the result to 2 decimal places', () => {
    // 3 × 2.333 - 0 = 6.999 → 7.00
    expect(computePurchaseLineTotal(3, 2.333, 0)).toBe(7.0)
  })

  it('handles zero discount', () => {
    // 5 × 8.00 - 0 = 40.00
    expect(computePurchaseLineTotal(5, 8, 0)).toBe(40.0)
  })

  it('handles fractional quantities', () => {
    // 2.5 × 6.00 - 1.50 = 13.50
    expect(computePurchaseLineTotal(2.5, 6, 1.5)).toBe(13.5)
  })
})

describe('computeDocumentTotals', () => {
  it('returns zeros for empty items array', () => {
    const result = computeDocumentTotals([])
    expect(result).toEqual({
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 0
    })
  })

  it('computes totals for a single item', () => {
    const items = [{ quantity: 10, unitPrice: 5.0, discountAmount: 2.0, taxAmount: 4.8 }]
    // subtotal = 10 × 5.00 = 50.00
    // discountAmount = 2.00
    // taxAmount = 4.80
    // totalAmount = 50.00 - 2.00 + 4.80 = 52.80
    const result = computeDocumentTotals(items)
    expect(result).toEqual({
      subtotal: 50.0,
      discountAmount: 2.0,
      taxAmount: 4.8,
      totalAmount: 52.8
    })
  })

  it('computes totals for multiple items', () => {
    const items = [
      { quantity: 2, unitPrice: 10.0, discountAmount: 1.0, taxAmount: 1.9 },
      { quantity: 3, unitPrice: 7.5, discountAmount: 0.5, taxAmount: 2.2 },
      { quantity: 1, unitPrice: 25.0, discountAmount: 3.0, taxAmount: 2.2 }
    ]
    // subtotal = (2×10) + (3×7.5) + (1×25) = 20 + 22.5 + 25 = 67.50
    // discountAmount = 1 + 0.5 + 3 = 4.50
    // taxAmount = 1.9 + 2.2 + 2.2 = 6.30
    // totalAmount = 67.50 - 4.50 + 6.30 = 69.30
    const result = computeDocumentTotals(items)
    expect(result).toEqual({
      subtotal: 67.5,
      discountAmount: 4.5,
      taxAmount: 6.3,
      totalAmount: 69.3
    })
  })

  it('rounds each aggregate to 2 decimal places', () => {
    const items = [
      { quantity: 3, unitPrice: 1.333, discountAmount: 0.333, taxAmount: 0.333 },
      { quantity: 3, unitPrice: 1.333, discountAmount: 0.333, taxAmount: 0.333 }
    ]
    // subtotal = (3×1.333) + (3×1.333) = 3.999 + 3.999 = 7.998 → 8.00
    // discountAmount = 0.333 + 0.333 = 0.666 → 0.67
    // taxAmount = 0.333 + 0.333 = 0.666 → 0.67
    // totalAmount = 8.00 - 0.67 + 0.67 = 8.00
    const result = computeDocumentTotals(items)
    expect(result).toEqual({
      subtotal: 8.0,
      discountAmount: 0.67,
      taxAmount: 0.67,
      totalAmount: 8.0
    })
  })

  it('handles items with zero tax and discount', () => {
    const items = [{ quantity: 5, unitPrice: 20.0, discountAmount: 0, taxAmount: 0 }]
    const result = computeDocumentTotals(items)
    expect(result).toEqual({
      subtotal: 100.0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 100.0
    })
  })
})
