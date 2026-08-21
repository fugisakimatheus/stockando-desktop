/**
 * DocumentSeriesService — atomic fiscal document number generation.
 *
 * Provides sequential numbering for fiscal documents (NF-e, NFC-e) using
 * the `documentSeries` table. The caller must invoke `getNextNumber` within
 * an existing transaction to guarantee atomicity and prevent concurrent
 * generation issues.
 *
 * Requirements: 4.6, 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { and, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { SeriesNotConfiguredError } from '../api/errors'
import type * as schema from '../db/schema'
import { documentSeries } from '../db/schema'

// ---------------------------------------------------------------------------
// Transaction type alias
// ---------------------------------------------------------------------------

type DrizzleTx = BetterSQLite3Database<typeof schema>

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the next sequential document number for a given company, document type, and series.
 *
 * Must be called within an existing transaction to guarantee atomicity and prevent
 * concurrent sequences from producing duplicates.
 *
 * The unique index on (companyId, documentType, series) in the `documentSeries` table
 * ensures no duplicate numbers can be generated for the same combination.
 *
 * @param tx - The Drizzle transaction handle
 * @param companyId - The active company identifier
 * @param documentType - The fiscal document type (e.g., "NF-e", "NFC-e")
 * @param series - The series identifier (e.g., "1", "001")
 * @returns The next sequential number for the given series
 * @throws SeriesNotConfiguredError if no series record exists for the given parameters
 */
export async function getNextNumber(
  tx: DrizzleTx,
  companyId: number,
  documentType: string,
  series: string
): Promise<number> {
  const now = new Date().toISOString()

  // 1. Look up the series record for the given company, document type, and series
  const [seriesRecord] = await tx
    .select()
    .from(documentSeries)
    .where(
      and(
        eq(documentSeries.companyId, companyId),
        eq(documentSeries.documentType, documentType),
        eq(documentSeries.series, series)
      )
    )

  if (!seriesRecord) {
    throw new SeriesNotConfiguredError(
      `Document series not configured for company ${companyId}, type "${documentType}", series "${series}"`
    )
  }

  // 2. Increment the current number atomically
  const nextNumber = seriesRecord.currentNumber + 1

  await tx
    .update(documentSeries)
    .set({ currentNumber: nextNumber, updatedAt: now })
    .where(eq(documentSeries.id, seriesRecord.id))

  // 3. Return the new sequential number
  return nextNumber
}
