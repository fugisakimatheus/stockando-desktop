/**
 * NumberingService — sequential document number generation for commercial documents.
 *
 * Generates unique, sequential numbers for quotes, sales orders, and purchase orders
 * within a company scope. Uses the `numberingSequences` table to track the current
 * value per (companyId, sequenceType) pair.
 *
 * The function accepts a transaction handle to ensure atomic increment — callers must
 * invoke it within their own db.transaction() block to prevent concurrent generation issues.
 *
 * Requirements: 3.1, 6.1, 8.1
 */

import { and, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import type * as schema from '../db/schema'
import { numberingSequences } from '../db/schema'

// ---------------------------------------------------------------------------
// Sequence type constants
// ---------------------------------------------------------------------------

export const SEQUENCE_TYPES = {
  quote: 'quote',
  sales_order: 'sales_order',
  purchase_order: 'purchase_order'
} as const satisfies Record<string, string>

export type SequenceType = (typeof SEQUENCE_TYPES)[keyof typeof SEQUENCE_TYPES]

// ---------------------------------------------------------------------------
// Number prefix mapping
// ---------------------------------------------------------------------------

const SEQUENCE_PREFIX: Record<SequenceType, string> = {
  quote: 'ORC',
  sales_order: 'VND',
  purchase_order: 'CMP'
} as const

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the next sequential document number for a given company and sequence type.
 *
 * Must be called within an existing transaction to guarantee atomicity and prevent
 * concurrent sequences from producing duplicates.
 *
 * If no sequence record exists for the given (companyId, sequenceType), one is created
 * starting at 1.
 *
 * @param tx - The Drizzle transaction handle
 * @param companyId - The active company identifier
 * @param sequenceType - The document type to generate a number for
 * @returns A formatted document number (e.g., "ORC-000001", "VND-000042", "CMP-000003")
 */
export async function generateNextNumber(
  tx: BetterSQLite3Database<typeof schema>,
  companyId: number,
  sequenceType: SequenceType
): Promise<string> {
  const now = new Date().toISOString()

  // 1. Look up the current sequence record
  const [existing] = await tx
    .select()
    .from(numberingSequences)
    .where(and(eq(numberingSequences.companyId, companyId), eq(numberingSequences.sequenceType, sequenceType)))

  let nextValue: number

  if (existing) {
    // 2a. Increment the existing sequence
    nextValue = existing.currentValue + 1
    await tx
      .update(numberingSequences)
      .set({ currentValue: nextValue, updatedAt: now })
      .where(eq(numberingSequences.id, existing.id))
  } else {
    // 2b. Create a new sequence record starting at 1
    nextValue = 1
    await tx.insert(numberingSequences).values({
      companyId,
      sequenceType,
      currentValue: nextValue,
      createdAt: now,
      updatedAt: now
    })
  }

  // 3. Format and return the document number
  return formatDocumentNumber(sequenceType, nextValue)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Formats a document number with prefix and zero-padded sequence value.
 * Pattern: PREFIX-NNNNNN (6-digit zero-padded)
 */
function formatDocumentNumber(sequenceType: SequenceType, value: number): string {
  const prefix = SEQUENCE_PREFIX[sequenceType]
  const paddedValue = String(value).padStart(6, '0')
  return `${prefix}-${paddedValue}`
}
