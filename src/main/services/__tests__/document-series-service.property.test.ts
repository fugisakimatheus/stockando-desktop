/**
 * Property-based tests for DocumentSeriesService.
 *
 * **Validates: Requirements 4.6, 16.1, 16.2**
 *
 * Property 13: Sequential document numbering
 * "For any series with currentNumber = 0, calling getNextNumber N times (1 ≤ N ≤ 20)
 * SHALL return numbers strictly sequential: 1, 2, 3, ..., N. After all calls, the stored
 * currentNumber in the DB SHALL equal N. Numbers are never duplicated."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { SeriesNotConfiguredError } from '../../api/errors'
import * as schema from '../../db/schema'
import { getNextNumber } from '../document-series-service'

// ---------------------------------------------------------------------------
// Test database setup
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      document_number TEXT NOT NULL,
      trade_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE document_series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      series TEXT NOT NULL,
      current_number INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX document_series_company_type_series_unique
      ON document_series(company_id, document_type, series);
  `)

  return sqlite
}

function seedCompany(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Test Company', '12345678000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

function seedSeries(
  sqlite: Database.Database,
  companyId: number,
  documentType: string,
  series: string,
  currentNumber = 0
): void {
  const now = '2024-01-01T00:00:00.000Z'
  sqlite
    .prepare(
      `INSERT INTO document_series (company_id, document_type, series, current_number, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    )
    .run(companyId, documentType, series, currentNumber, now, now)
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const documentTypeArb = fc.constantFrom('NF-e', 'NFC-e')

const seriesArb = fc.constantFrom('1', '01', '001', '2', '99')

const callCountArb = fc.integer({ min: 1, max: 20 })

// ---------------------------------------------------------------------------
// Property 13: Sequential document numbering
// ---------------------------------------------------------------------------

describe('Property 13: Sequential document numbering', () => {
  it('getNextNumber returns strictly sequential numbers 1..N and updates stored currentNumber to N', async () => {
    await fc.assert(
      fc.asyncProperty(documentTypeArb, seriesArb, callCountArb, async (documentType, series, n) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        seedCompany(sqlite)
        seedSeries(sqlite, 1, documentType, series, 0)

        try {
          const results: number[] = []

          for (let i = 0; i < n; i++) {
            const num = await getNextNumber(db, 1, documentType, series)
            results.push(num)
          }

          // Verify strictly sequential: 1, 2, 3, ..., N
          for (let i = 0; i < n; i++) {
            expect(results[i]).toBe(i + 1)
          }

          // Verify no duplicates
          const uniqueResults = new Set(results)
          expect(uniqueResults.size).toBe(n)

          // Verify stored currentNumber equals N
          const row = sqlite
            .prepare(
              `SELECT current_number FROM document_series
                 WHERE company_id = 1 AND document_type = ? AND series = ?`
            )
            .get(documentType, series) as { current_number: number }

          expect(row.current_number).toBe(n)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('throws SeriesNotConfiguredError when series does not exist', async () => {
    await fc.assert(
      fc.asyncProperty(documentTypeArb, seriesArb, async (documentType, series) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        seedCompany(sqlite)
        // No series seeded — should throw

        try {
          await expect(getNextNumber(db, 1, documentType, series)).rejects.toThrow(SeriesNotConfiguredError)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 30 }
    )
  })

  it('each call returns a unique number — no duplicates across N calls', async () => {
    await fc.assert(
      fc.asyncProperty(documentTypeArb, seriesArb, callCountArb, async (documentType, series, n) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        seedCompany(sqlite)
        seedSeries(sqlite, 1, documentType, series, 0)

        try {
          const numbers: number[] = []

          for (let i = 0; i < n; i++) {
            numbers.push(await getNextNumber(db, 1, documentType, series))
          }

          // All numbers must be unique
          const unique = new Set(numbers)
          expect(unique.size).toBe(n)

          // All numbers must be positive
          for (const num of numbers) {
            expect(num).toBeGreaterThan(0)
          }
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})
