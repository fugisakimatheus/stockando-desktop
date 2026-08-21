/**
 * Property test for AttachmentService — listing correct entity attachments.
 *
 * **Validates: Requirements 8.3**
 *
 * Property 21: Attachment listing returns correct entity attachments
 * "For N attachment records inserted across multiple (entityType, entityId) pairs,
 * calling listForEntity for a specific pair returns exactly the attachments for that
 * entity, with no cross-entity or cross-company leakage."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-data' }
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn()
}))

import { getDb } from '../../server'
import { listForEntity } from '../attachment-service'

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

    CREATE TABLE attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX attachments_company_idx ON attachments(company_id);
    CREATE INDEX attachments_entity_idx ON attachments(entity_type, entity_id);
  `)

  return sqlite
}

function seedCompanies(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES
      (1, 'Company A', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
      (2, 'Company B', '22222222000200', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

const COMPANY_A = 1
const COMPANY_B = 2

const ENTITY_TYPES = ['sales_order', 'purchase_order', 'fiscal_document', 'payment'] as const

/**
 * Generates a valid entity type from the allowed set.
 */
const entityTypeArb = fc.constantFrom(...ENTITY_TYPES)

/**
 * Generates a valid entity ID (positive integer as string).
 */
const entityIdArb = fc.integer({ min: 1, max: 1000 }).map(String)

/**
 * Generates a valid file name.
 */
const fileNameArb = fc
  .tuple(fc.stringMatching(/^[a-z0-9]{1,20}$/), fc.constantFrom('.pdf', '.png', '.jpg', '.xml', '.txt'))
  .map(([name, ext]) => `${name}${ext}`)

/**
 * Generates a MIME type.
 */
const mimeTypeArb = fc.constantFrom('application/pdf', 'image/png', 'image/jpeg', 'text/xml', 'text/plain')

/**
 * Generates an attachment record for insertion.
 */
const attachmentArb = fc.record({
  entityType: entityTypeArb,
  entityId: entityIdArb,
  fileName: fileNameArb,
  mimeType: mimeTypeArb,
  fileSize: fc.integer({ min: 100, max: 10_000_000 })
})

describe('AttachmentService - listForEntity (Property 21)', () => {
  it('returns exactly the attachments for the queried (entityType, entityId) pair', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(attachmentArb, { minLength: 1, maxLength: 20 }), async (attachmentInputs) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()
          const insertStmt = sqlite.prepare(`
              INSERT INTO attachments (company_id, entity_type, entity_id, file_name, file_path, mime_type, file_size, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)

          // Insert all attachments for Company A
          for (const att of attachmentInputs) {
            const filePath = `1/attachments/${att.entityType}/${att.entityId}/${att.fileName}`
            insertStmt.run(
              COMPANY_A,
              att.entityType,
              att.entityId,
              att.fileName,
              filePath,
              att.mimeType,
              att.fileSize,
              now
            )
          }

          // For each unique (entityType, entityId) pair, verify listForEntity returns correct results
          const pairs = new Map<string, typeof attachmentInputs>()
          for (const att of attachmentInputs) {
            const key = `${att.entityType}:${att.entityId}`
            if (!pairs.has(key)) {
              pairs.set(key, [])
            }
            pairs.get(key)?.push(att)
          }

          for (const [key, expected] of pairs) {
            const [entityType, entityId] = key.split(':')
            const result = await listForEntity(COMPANY_A, entityType, entityId)

            // Exact count matches
            expect(result).toHaveLength(expected.length)

            // All returned records have the correct entity type and ID
            for (const record of result) {
              expect(record.entityType).toBe(entityType)
              expect(record.entityId).toBe(entityId)
            }
          }
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('does not return attachments from other companies', async () => {
    await fc.assert(
      fc.asyncProperty(attachmentArb, attachmentArb, async (attA, attB) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()
          const insertStmt = sqlite.prepare(`
              INSERT INTO attachments (company_id, entity_type, entity_id, file_name, file_path, mime_type, file_size, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)

          // Insert attachment for Company A
          const filePathA = `1/attachments/${attA.entityType}/${attA.entityId}/${attA.fileName}`
          insertStmt.run(
            COMPANY_A,
            attA.entityType,
            attA.entityId,
            attA.fileName,
            filePathA,
            attA.mimeType,
            attA.fileSize,
            now
          )

          // Insert attachment for Company B with same entityType and entityId
          const filePathB = `2/attachments/${attA.entityType}/${attA.entityId}/${attB.fileName}`
          insertStmt.run(
            COMPANY_B,
            attA.entityType,
            attA.entityId,
            attB.fileName,
            filePathB,
            attB.mimeType,
            attB.fileSize,
            now
          )

          // Query for Company A — should only see Company A's attachment
          const resultA = await listForEntity(COMPANY_A, attA.entityType, attA.entityId)

          expect(resultA).toHaveLength(1)
          expect(resultA[0].fileName).toBe(attA.fileName)

          // Query for Company B — should only see Company B's attachment
          const resultB = await listForEntity(COMPANY_B, attA.entityType, attA.entityId)

          expect(resultB).toHaveLength(1)
          expect(resultB[0].fileName).toBe(attB.fileName)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('returns empty array when no attachments exist for the queried entity', async () => {
    await fc.assert(
      fc.asyncProperty(attachmentArb, entityTypeArb, entityIdArb, async (att, queryEntityType, queryEntityId) => {
        // Ensure the query targets a different entity than the inserted one
        fc.pre(att.entityType !== queryEntityType || att.entityId !== queryEntityId)

        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()
          const filePath = `1/attachments/${att.entityType}/${att.entityId}/${att.fileName}`
          sqlite
            .prepare(`
              INSERT INTO attachments (company_id, entity_type, entity_id, file_name, file_path, mime_type, file_size, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(COMPANY_A, att.entityType, att.entityId, att.fileName, filePath, att.mimeType, att.fileSize, now)

          // Query for a different entity — should return empty
          const result = await listForEntity(COMPANY_A, queryEntityType, queryEntityId)
          expect(result).toHaveLength(0)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})
