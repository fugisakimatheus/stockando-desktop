/**
 * Unit tests for status transition validation utilities.
 *
 * Tests cover:
 * - All valid quote transitions are accepted
 * - All valid sales order transitions are accepted
 * - All valid purchase order transitions are accepted
 * - Invalid transitions are rejected with correct allowed array
 * - Terminal statuses reject all transitions
 *
 * **Validates: Requirements 4.1, 4.2, 7.1, 7.2, 8.6, 8.7**
 */

import { describe, expect, it } from 'vitest'

import {
  PAYMENT_STATUSES,
  PURCHASE_ORDER_STATUSES,
  QUOTE_STATUSES,
  SALES_ORDER_STATUSES,
  VALID_PURCHASE_ORDER_TRANSITIONS,
  VALID_QUOTE_TRANSITIONS,
  VALID_SALES_ORDER_TRANSITIONS,
  validateTransition
} from '../status-transitions'
import type { PurchaseOrderStatus, QuoteStatus, SalesOrderStatus } from '../status-transitions'

describe('Status Constants', () => {
  it('should define all quote statuses', () => {
    expect(QUOTE_STATUSES).toEqual({
      draft: 'draft',
      sent: 'sent',
      accepted: 'accepted',
      rejected: 'rejected',
      converted: 'converted',
      cancelled: 'cancelled'
    })
  })

  it('should define all sales order statuses', () => {
    expect(SALES_ORDER_STATUSES).toEqual({
      draft: 'draft',
      confirmed: 'confirmed',
      partially_fulfilled: 'partially_fulfilled',
      fulfilled: 'fulfilled',
      cancelled: 'cancelled'
    })
  })

  it('should define all purchase order statuses', () => {
    expect(PURCHASE_ORDER_STATUSES).toEqual({
      draft: 'draft',
      sent: 'sent',
      partially_received: 'partially_received',
      received: 'received',
      cancelled: 'cancelled'
    })
  })

  it('should define all payment statuses', () => {
    expect(PAYMENT_STATUSES).toEqual({
      unpaid: 'unpaid',
      partially_paid: 'partially_paid',
      paid: 'paid'
    })
  })
})

describe('validateTransition — Quote Transitions', () => {
  it('should accept draft → sent', () => {
    const result = validateTransition('draft', 'sent', VALID_QUOTE_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept draft → cancelled', () => {
    const result = validateTransition('draft', 'cancelled', VALID_QUOTE_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept sent → accepted', () => {
    const result = validateTransition('sent', 'accepted', VALID_QUOTE_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept sent → rejected', () => {
    const result = validateTransition('sent', 'rejected', VALID_QUOTE_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept sent → cancelled', () => {
    const result = validateTransition('sent', 'cancelled', VALID_QUOTE_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept accepted → converted', () => {
    const result = validateTransition('accepted', 'converted', VALID_QUOTE_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should reject draft → accepted (invalid)', () => {
    const result = validateTransition('draft', 'accepted', VALID_QUOTE_TRANSITIONS)
    expect(result).toEqual({
      valid: false,
      currentStatus: 'draft',
      allowed: ['sent', 'cancelled']
    })
  })

  it('should reject sent → converted (invalid)', () => {
    const result = validateTransition('sent', 'converted', VALID_QUOTE_TRANSITIONS)
    expect(result).toEqual({
      valid: false,
      currentStatus: 'sent',
      allowed: ['accepted', 'rejected', 'cancelled']
    })
  })

  it('should reject transitions from terminal statuses', () => {
    const terminalStatuses: QuoteStatus[] = ['rejected', 'converted', 'cancelled']

    for (const status of terminalStatuses) {
      const allTargets: QuoteStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'converted', 'cancelled']
      for (const target of allTargets) {
        const result = validateTransition(status, target, VALID_QUOTE_TRANSITIONS)
        expect(result).toEqual({
          valid: false,
          currentStatus: status,
          allowed: []
        })
      }
    }
  })
})

describe('validateTransition — Sales Order Transitions', () => {
  it('should accept draft → confirmed', () => {
    const result = validateTransition('draft', 'confirmed', VALID_SALES_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept draft → cancelled', () => {
    const result = validateTransition('draft', 'cancelled', VALID_SALES_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept confirmed → partially_fulfilled', () => {
    const result = validateTransition('confirmed', 'partially_fulfilled', VALID_SALES_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept confirmed → fulfilled', () => {
    const result = validateTransition('confirmed', 'fulfilled', VALID_SALES_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept confirmed → cancelled', () => {
    const result = validateTransition('confirmed', 'cancelled', VALID_SALES_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept partially_fulfilled → fulfilled', () => {
    const result = validateTransition('partially_fulfilled', 'fulfilled', VALID_SALES_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should reject draft → fulfilled (invalid)', () => {
    const result = validateTransition('draft', 'fulfilled', VALID_SALES_ORDER_TRANSITIONS)
    expect(result).toEqual({
      valid: false,
      currentStatus: 'draft',
      allowed: ['confirmed', 'cancelled']
    })
  })

  it('should reject partially_fulfilled → cancelled (invalid)', () => {
    const result = validateTransition('partially_fulfilled', 'cancelled', VALID_SALES_ORDER_TRANSITIONS)
    expect(result).toEqual({
      valid: false,
      currentStatus: 'partially_fulfilled',
      allowed: ['fulfilled']
    })
  })

  it('should reject transitions from terminal statuses', () => {
    const terminalStatuses: SalesOrderStatus[] = ['fulfilled', 'cancelled']

    for (const status of terminalStatuses) {
      const allTargets: SalesOrderStatus[] = ['draft', 'confirmed', 'partially_fulfilled', 'fulfilled', 'cancelled']
      for (const target of allTargets) {
        const result = validateTransition(status, target, VALID_SALES_ORDER_TRANSITIONS)
        expect(result).toEqual({
          valid: false,
          currentStatus: status,
          allowed: []
        })
      }
    }
  })
})

describe('validateTransition — Purchase Order Transitions', () => {
  it('should accept draft → sent', () => {
    const result = validateTransition('draft', 'sent', VALID_PURCHASE_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept draft → cancelled', () => {
    const result = validateTransition('draft', 'cancelled', VALID_PURCHASE_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept sent → partially_received', () => {
    const result = validateTransition('sent', 'partially_received', VALID_PURCHASE_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept sent → received', () => {
    const result = validateTransition('sent', 'received', VALID_PURCHASE_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept sent → cancelled', () => {
    const result = validateTransition('sent', 'cancelled', VALID_PURCHASE_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should accept partially_received → received', () => {
    const result = validateTransition('partially_received', 'received', VALID_PURCHASE_ORDER_TRANSITIONS)
    expect(result).toEqual({ valid: true })
  })

  it('should reject draft → received (invalid)', () => {
    const result = validateTransition('draft', 'received', VALID_PURCHASE_ORDER_TRANSITIONS)
    expect(result).toEqual({
      valid: false,
      currentStatus: 'draft',
      allowed: ['sent', 'cancelled']
    })
  })

  it('should reject partially_received → cancelled (invalid)', () => {
    const result = validateTransition('partially_received', 'cancelled', VALID_PURCHASE_ORDER_TRANSITIONS)
    expect(result).toEqual({
      valid: false,
      currentStatus: 'partially_received',
      allowed: ['received']
    })
  })

  it('should reject transitions from terminal statuses', () => {
    const terminalStatuses: PurchaseOrderStatus[] = ['received', 'cancelled']

    for (const status of terminalStatuses) {
      const allTargets: PurchaseOrderStatus[] = ['draft', 'sent', 'partially_received', 'received', 'cancelled']
      for (const target of allTargets) {
        const result = validateTransition(status, target, VALID_PURCHASE_ORDER_TRANSITIONS)
        expect(result).toEqual({
          valid: false,
          currentStatus: status,
          allowed: []
        })
      }
    }
  })
})
