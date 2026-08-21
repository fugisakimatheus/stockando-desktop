/**
 * Property-based tests for the AuditService.
 *
 * **Validates: Requirements 9.5, 9.6, 10.1, 10.4**
 *
 * Property 22: Audit log completeness and format
 * "For any audit-producing operation, the resulting audit log entry SHALL include
 * a non-null companyId, a non-null userId, and a details field that is valid
 * parseable JSON."
 *
 * Property 23: Audit history ordering
 * "For any entity's audit history with N entries, the returned list SHALL be
 * ordered by creation date descending (most recent first), and each successive
 * entry SHALL have a createdAt <= the previous entry's createdAt."
 *
 * Property 24: Audit preview returns at most 5 entries
 * "For any entity with N audit log entries where N > 5, an audit preview request
 * SHALL return exactly 5 entries (the most recent). For entities with N <= 5
 * entries, it SHALL return exactly N entries."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import { historyForEntity, logAudit, previewForEntity } from '../audit-service'

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

function seedCompanyAndUser(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Test Company', '12345678000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO users (id, company_id, name, email, role, status, created_at, updated_at)
    VALUES (1, 1, 'Admin User', 'admin@test.com', 'admin', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a non-empty entity type string (alphanumeric + underscore). */
const entityTypeArb = fc.stringMatching(/^[a-z][a-z_]{0,19}$/)

/** Generates a non-empty entity ID string (numeric-like). */
const entityIdArb = fc.nat({ max: 9999 }).map((n) => String(n + 1))

/** Generates a non-empty action string. */
const actionArb = fc.stringMatching(/^[a-z][a-z_]{0,19}$/)

/** Generates a valid JSON details string. */
const detailsArb = fc
  .record({
    amount: fc.double({ min: 0.01, max: 99999.99, noNaN: true }),
    reference: fc.string({ minLength: 1, maxLength: 20 })
  })
  .map((obj) => JSON.stringify(obj))

describe('Property 22: Audit log completeness and format', () => {
  it('stored audit entry contains all input fields and valid ISO createdAt', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityTypeArb,
        entityIdArb,
        actionArb,
        detailsArb,
        async (entityType, entityId, action, details) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompanyAndUser(sqlite)

          try {
            const before = new Date().toISOString()

            await logAudit({
              companyId: 1,
              entityType,
              entityId,
              action,
              userId: 1,
              details
            })

            const after = new Date().toISOString()

            const row = sqlite.prepare('SELECT * FROM audit_logs WHERE id = 1').get() as {
              id: number
              company_id: number
              entity_type: string
              entity_id: string
              action: string
              user_id: number | null
              details: string | null
              created_at: string
            }

            // All input fields are preserved
            expect(row.company_id).toBe(1)
            expect(row.entity_type).toBe(entityType)
            expect(row.entity_id).toBe(entityId)
            expect(row.action).toBe(action)
            expect(row.user_id).toBe(1)
            expect(row.details).toBe(details)

            // createdAt is a valid ISO timestamp within the execution window
            expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
            expect(row.created_at >= before).toBe(true)
            expect(row.created_at <= after).toBe(true)

            // details field is valid parseable JSON
            expect(() => JSON.parse(row.details ?? '')).not.toThrow()
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})

describe('Property 23: Audit history ordering', () => {
  it('historyForEntity returns entries in descending createdAt order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 15 }).map((n) => n + 2), // N entries between 2 and 17
        entityTypeArb,
        entityIdArb,
        async (entryCount, entityType, entityId) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompanyAndUser(sqlite)

          try {
            // Insert N audit entries with distinct, increasing timestamps
            for (let i = 0; i < entryCount; i++) {
              const timestamp = `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`
              sqlite
                .prepare(
                  `INSERT INTO audit_logs (company_id, entity_type, entity_id, action, user_id, details, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`
                )
                .run(1, entityType, entityId, 'test_action', 1, '{"i":' + i + '}', timestamp)
            }

            // Query the full history
            const result = await historyForEntity(1, entityType, entityId, {
              limit: entryCount + 10,
              offset: 0
            })

            expect(result.data.length).toBe(entryCount)

            // Verify descending order: each createdAt <= previous
            for (let i = 1; i < result.data.length; i++) {
              expect(result.data[i - 1].createdAt >= result.data[i].createdAt).toBe(true)
            }
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})

describe('Property 24: Audit preview returns at most 5 entries', () => {
  it('previewForEntity returns min(N, 5) entries for N audit logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 20 }), // N entries between 0 and 20
        entityTypeArb,
        entityIdArb,
        async (entryCount, entityType, entityId) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompanyAndUser(sqlite)

          try {
            // Insert N audit entries with distinct timestamps
            for (let i = 0; i < entryCount; i++) {
              const day = String((i % 28) + 1).padStart(2, '0')
              const month = String(Math.floor(i / 28) + 1).padStart(2, '0')
              const timestamp = `2024-${month}-${day}T12:00:00.000Z`
              sqlite
                .prepare(
                  `INSERT INTO audit_logs (company_id, entity_type, entity_id, action, user_id, details, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`
                )
                .run(1, entityType, entityId, 'action_' + i, 1, null, timestamp)
            }

            const preview = await previewForEntity(1, entityType, entityId)

            // Result length is min(N, 5)
            const expectedLength = Math.min(entryCount, 5)
            expect(preview.length).toBe(expectedLength)

            // If there are results, they should be in descending order
            for (let i = 1; i < preview.length; i++) {
              expect(preview[i - 1].createdAt >= preview[i].createdAt).toBe(true)
            }
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})
