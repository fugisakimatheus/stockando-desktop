/**
 * Unit tests for the NumberingService.
 *
 * Tests cover:
 * - Generating sequential numbers for each sequence type
 * - Creating a new sequence record when none exists
 * - Incrementing an existing sequence record
 * - Formatting with correct prefixes and zero-padding
 * - Company isolation (different companies get independent sequences)
 *
 * **Validates: Requirements 3.1, 6.1, 8.1**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { generateNextNumber, SEQUENCE_TYPES } from '../numbering-service'

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

    CREATE TABLE numbering_sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sequence_type TEXT NOT NULL,
      current_value INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX numbering_sequences_company_type_unique
      ON numbering_sequences(company_id, sequence_type);
  `)

  // Seed companies
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Company A', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (2, 'Company B', '22222222000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)

  return sqlite
}

describe('NumberingService - generateNextNumber', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(() => {
    sqlite = createTestDb()
    db = drizzle(sqlite, { schema })
  })

  afterEach(() => {
    sqlite.close()
  })

  it('should create a new sequence and return the first number for quotes', async () => {
    const result = await generateNextNumber(db, 1, SEQUENCE_TYPES.quote)

    expect(result).toBe('ORC-000001')

    // Verify the sequence record was created
    const rows = sqlite.prepare('SELECT * FROM numbering_sequences WHERE company_id = 1').all() as {
      current_value: number
      sequence_type: string
    }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].sequence_type).toBe('quote')
    expect(rows[0].current_value).toBe(1)
  })

  it('should create a new sequence and return the first number for sales orders', async () => {
    const result = await generateNextNumber(db, 1, SEQUENCE_TYPES.sales_order)

    expect(result).toBe('VND-000001')
  })

  it('should create a new sequence and return the first number for purchase orders', async () => {
    const result = await generateNextNumber(db, 1, SEQUENCE_TYPES.purchase_order)

    expect(result).toBe('CMP-000001')
  })

  it('should increment an existing sequence and return the next number', async () => {
    // Seed an existing sequence at value 5
    sqlite.exec(`
      INSERT INTO numbering_sequences (company_id, sequence_type, current_value, created_at, updated_at)
      VALUES (1, 'quote', 5, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
    `)

    const result = await generateNextNumber(db, 1, SEQUENCE_TYPES.quote)

    expect(result).toBe('ORC-000006')

    // Verify the sequence was updated
    const rows = sqlite
      .prepare('SELECT current_value FROM numbering_sequences WHERE company_id = 1 AND sequence_type = ?')
      .all('quote') as {
      current_value: number
    }[]
    expect(rows[0].current_value).toBe(6)
  })

  it('should generate sequential numbers on consecutive calls', async () => {
    const first = await generateNextNumber(db, 1, SEQUENCE_TYPES.sales_order)
    const second = await generateNextNumber(db, 1, SEQUENCE_TYPES.sales_order)
    const third = await generateNextNumber(db, 1, SEQUENCE_TYPES.sales_order)

    expect(first).toBe('VND-000001')
    expect(second).toBe('VND-000002')
    expect(third).toBe('VND-000003')
  })

  it('should maintain independent sequences per company', async () => {
    const companyA = await generateNextNumber(db, 1, SEQUENCE_TYPES.quote)
    const companyB = await generateNextNumber(db, 2, SEQUENCE_TYPES.quote)

    expect(companyA).toBe('ORC-000001')
    expect(companyB).toBe('ORC-000001')

    // Second call for company A should be 2, company B should be 2
    const companyA2 = await generateNextNumber(db, 1, SEQUENCE_TYPES.quote)
    const companyB2 = await generateNextNumber(db, 2, SEQUENCE_TYPES.quote)

    expect(companyA2).toBe('ORC-000002')
    expect(companyB2).toBe('ORC-000002')
  })

  it('should maintain independent sequences per sequence type within the same company', async () => {
    const quote = await generateNextNumber(db, 1, SEQUENCE_TYPES.quote)
    const salesOrder = await generateNextNumber(db, 1, SEQUENCE_TYPES.sales_order)
    const purchaseOrder = await generateNextNumber(db, 1, SEQUENCE_TYPES.purchase_order)

    expect(quote).toBe('ORC-000001')
    expect(salesOrder).toBe('VND-000001')
    expect(purchaseOrder).toBe('CMP-000001')

    // Each continues independently
    const quote2 = await generateNextNumber(db, 1, SEQUENCE_TYPES.quote)
    expect(quote2).toBe('ORC-000002')
  })

  it('should update the updatedAt timestamp when incrementing', async () => {
    sqlite.exec(`
      INSERT INTO numbering_sequences (company_id, sequence_type, current_value, created_at, updated_at)
      VALUES (1, 'purchase_order', 10, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
    `)

    await generateNextNumber(db, 1, SEQUENCE_TYPES.purchase_order)

    const rows = sqlite
      .prepare('SELECT updated_at FROM numbering_sequences WHERE company_id = 1 AND sequence_type = ?')
      .all('purchase_order') as {
      updated_at: string
    }[]

    // updatedAt should be different from the seeded value
    expect(rows[0].updated_at).not.toBe('2024-01-01T00:00:00.000Z')
    expect(rows[0].updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('should zero-pad numbers correctly for large values', async () => {
    sqlite.exec(`
      INSERT INTO numbering_sequences (company_id, sequence_type, current_value, created_at, updated_at)
      VALUES (1, 'quote', 999999, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
    `)

    const result = await generateNextNumber(db, 1, SEQUENCE_TYPES.quote)

    expect(result).toBe('ORC-1000000')
  })
})
