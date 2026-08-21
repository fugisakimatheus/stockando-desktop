/**
 * Financial status derivation utilities.
 *
 * Provides functions to derive the financial status of an order based on
 * payment progress, classify overdue installments, and compute installment
 * totals for summary display.
 *
 * Requirements: 1.6, 1.7
 */

import { match } from 'ts-pattern'

import type { FinancialStatus, InstallmentStatus } from '../types/finance'

// ---------------------------------------------------------------------------
// Financial status derivation
// ---------------------------------------------------------------------------

/**
 * Derives the financial status of an order based on expected vs paid totals.
 *
 * - unpaid: no payments received (totalPaid === 0)
 * - paid: full amount settled (totalPaid >= totalExpected)
 * - partially_paid: partial settlement in progress
 */
export function deriveFinancialStatus(totalExpected: number, totalPaid: number): FinancialStatus {
  return match({ totalExpected, totalPaid })
    .when(
      ({ totalPaid }) => totalPaid === 0,
      () => 'unpaid' as const
    )
    .when(
      ({ totalExpected, totalPaid }) => totalPaid >= totalExpected,
      () => 'paid' as const
    )
    .otherwise(() => 'partially_paid' as const)
}

// ---------------------------------------------------------------------------
// Overdue classification
// ---------------------------------------------------------------------------

/**
 * Classifies whether an installment is overdue based on its status and due date.
 *
 * An installment is overdue when it is still pending and its due date is
 * before today (comparing ISO date strings lexicographically).
 */
export function classifyOverdue(status: InstallmentStatus, dueDate: string): boolean {
  if (status !== 'pending') return false
  const today = new Date().toISOString().slice(0, 10)
  return dueDate < today
}

// ---------------------------------------------------------------------------
// Installment totals computation
// ---------------------------------------------------------------------------

interface InstallmentEntry {
  amount: number
  status: InstallmentStatus
  dueDate: string
}

/**
 * Computes aggregate totals from a list of installments.
 *
 * - totalExpected: sum of all installment amounts
 * - totalPaid: sum of amounts where status is 'paid'
 * - totalOverdue: sum of amounts where installment is classified as overdue
 * - remainingBalance: totalExpected - totalPaid
 */
export function computeInstallmentTotals(installments: InstallmentEntry[]): {
  totalExpected: number
  totalPaid: number
  totalOverdue: number
  remainingBalance: number
} {
  const totalExpected = installments.reduce((sum, inst) => sum + inst.amount, 0)
  const totalPaid = installments.filter((inst) => inst.status === 'paid').reduce((sum, inst) => sum + inst.amount, 0)
  const totalOverdue = installments
    .filter((inst) => classifyOverdue(inst.status, inst.dueDate))
    .reduce((sum, inst) => sum + inst.amount, 0)
  const remainingBalance = totalExpected - totalPaid

  return { totalExpected, totalPaid, totalOverdue, remainingBalance }
}
