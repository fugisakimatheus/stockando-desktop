/**
 * Unit tests for the AuditService.
 *
 * Tests cover:
 * - Inserting an audit log entry with all required fields
 * - Setting createdAt to the current ISO timestamp
 * - Handling optional userId and details fields
 *
 * **Validates: Requirements 12.1, 12.2, 12.3, 12.4**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import { logAudit } from '../audit-service'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

import { getDb } from '../../server'

const mockedGetDb = vi.mocked(getDb)

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

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX audit_logs_company_idx ON audit_logs(company_id);
    CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
    CREATE INDEX audit_logs_user_idx ON audit_logs(user_id);
  `)

  return sqlite
}

describe('AuditService - logAudit', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = createTestDb()
    const db = drizzle(sqlite, { schema })
    mockedGetDb.mockReturnValue(db)

    // Seed a company for foreign key constraint
    sqlite.exec(`
      INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
      VALUES (1, 'Test Company', '12345678000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
    `)
  })

  afterEach(() => {
    sqlite.close()
  })

  it('should insert an audit log entry with all fields', async () => {
    // Seed a user for the userId reference
    sqlite.exec(`
      INSERT INTO users (id, company_id, name, email, role, status, created_at, updated_at)
      VALUES (1, 1, 'Admin User', 'admin@test.com', 'admin', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
    `)

    await logAudit({
      companyId: 1,
      entityType: 'product',
      entityId: '42',
      action: 'create',
      userId: 1,
      details: 'Created product SKU-001'
    })

    const rows = sqlite.prepare('SELECT * FROM audit_logs').all() as {
      id: number
      company_id: number
      entity_type: string
      entity_id: string
      action: string
      user_id: number | null
      details: string | null
      created_at: string
    }[]

    expect(rows).toHaveLength(1)
    expect(rows[0].company_id).toBe(1)
    expect(rows[0].entity_type).toBe('product')
    expect(rows[0].entity_id).toBe('42')
    expect(rows[0].action).toBe('create')
    expect(rows[0].user_id).toBe(1)
    expect(rows[0].details).toBe('Created product SKU-001')
    expect(rows[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('should insert an audit log entry without optional fields', async () => {
    await logAudit({
      companyId: 1,
      entityType: 'warehouse',
      entityId: '5',
      action: 'update'
    })

    const rows = sqlite.prepare('SELECT * FROM audit_logs').all() as {
      id: number
      company_id: number
      entity_type: string
      entity_id: string
      action: string
      user_id: number | null
      details: string | null
      created_at: string
    }[]

    expect(rows).toHaveLength(1)
    expect(rows[0].company_id).toBe(1)
    expect(rows[0].entity_type).toBe('warehouse')
    expect(rows[0].entity_id).toBe('5')
    expect(rows[0].action).toBe('update')
    expect(rows[0].user_id).toBeNull()
    expect(rows[0].details).toBeNull()
  })

  it('should set createdAt to a valid ISO timestamp', async () => {
    const before = new Date().toISOString()

    await logAudit({
      companyId: 1,
      entityType: 'stock_adjustment',
      entityId: '10',
      action: 'create'
    })

    const after = new Date().toISOString()

    const row = sqlite.prepare('SELECT created_at FROM audit_logs WHERE id = 1').get() as {
      created_at: string
    }

    expect(row.created_at >= before).toBe(true)
    expect(row.created_at <= after).toBe(true)
  })

  it('should include companyId in the audit log entry (requirement 12.4)', async () => {
    await logAudit({
      companyId: 1,
      entityType: 'product',
      entityId: '7',
      action: 'update',
      details: 'Updated product name'
    })

    const row = sqlite.prepare('SELECT company_id FROM audit_logs WHERE id = 1').get() as {
      company_id: number
    }

    expect(row.company_id).toBe(1)
  })
})
