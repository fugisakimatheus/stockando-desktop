/**
 * Property tests for reminder lifecycle.
 *
 * **Validates: Requirements 9.2, 9.3, 9.4**
 *
 * Property 14: Reminder status lifecycle
 * "For any reminder, the valid transitions are: active → dismissed, active → completed.
 * Dismissed or completed reminders SHALL NOT be modifiable back to active.
 * Dismissing SHALL set dismissedAt, completing SHALL set completedAt."
 *
 * Property 15: Reminder list ordering
 * "For any list of active reminders for a company, the returned results SHALL be
 * ordered by dueDate ascending. Each reminder's dueDate SHALL be <= the dueDate
 * of the next reminder in the list."
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

import { BusinessRuleError } from '../../api/errors'
import { getDb } from '../../server'
import { complete, create, dismiss, list } from '../reminder-service'

const mockedGetDb = vi.mocked(getDb)

// ---------------------------------------------------------------------------
// Test DB Setup
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
    CREATE UNIQUE INDEX companies_document_number_unique ON companies(document_number);

    CREATE TABLE automation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_params TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_params TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_evaluated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX automation_rules_company_idx ON automation_rules(company_id);

    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_summary TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      rule_id INTEGER REFERENCES automation_rules(id) ON DELETE SET NULL,
      dismissed_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX reminders_company_idx ON reminders(company_id);
    CREATE INDEX reminders_company_status_idx ON reminders(company_id, status);
    CREATE INDEX reminders_company_due_date_idx ON reminders(company_id, due_date);
    CREATE INDEX reminders_rule_idx ON reminders(rule_id);
  `)

  return sqlite
}

const COMPANY_ID = 1

function seedCompany(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (${COMPANY_ID}, 'Test Company', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const entityTypeArb = fc.constantFrom('order', 'installment', 'product', 'purchase_order')

const dueDateArb = fc.integer({ min: 1, max: 28 }).map((day) => `2024-07-${String(day).padStart(2, '0')}T00:00:00.000Z`)

const createReminderInputArb = fc.record({
  entityType: entityTypeArb,
  entityId: fc.integer({ min: 1, max: 9999 }).map(String),
  entitySummary: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  message: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  dueDate: dueDateArb
})

// ---------------------------------------------------------------------------
// Property 14: Reminder status lifecycle
// ---------------------------------------------------------------------------

describe('Reminder status lifecycle (Property 14)', () => {
  let sqlite: Database.Database
  let db: BetterSQLite3Database<typeof schema>

  beforeEach(() => {
    sqlite = createTestDb()
    db = drizzle(sqlite, { schema })
    mockedGetDb.mockReturnValue(db)
    seedCompany(sqlite)
  })

  it('active reminders can be dismissed and dismissedAt is set', async () => {
    await fc.assert(
      fc.asyncProperty(createReminderInputArb, async (input) => {
        // Create an active reminder
        const created = await create(COMPANY_ID, input)
        expect(created.status).toBe('active')

        // Dismiss it
        const dismissed = await dismiss(COMPANY_ID, created.id)
        expect(dismissed.status).toBe('dismissed')

        // Verify dismissedAt is set in the DB
        const row = sqlite.prepare('SELECT dismissed_at FROM reminders WHERE id = ?').get(created.id) as {
          dismissed_at: string | null
        }
        expect(row.dismissed_at).not.toBeNull()
      }),
      { numRuns: 50 }
    )
  })

  it('active reminders can be completed and completedAt is set', async () => {
    await fc.assert(
      fc.asyncProperty(createReminderInputArb, async (input) => {
        // Create an active reminder
        const created = await create(COMPANY_ID, input)
        expect(created.status).toBe('active')

        // Complete it
        const completed = await complete(COMPANY_ID, created.id)
        expect(completed.status).toBe('completed')

        // Verify completedAt is set in the DB
        const row = sqlite.prepare('SELECT completed_at FROM reminders WHERE id = ?').get(created.id) as {
          completed_at: string | null
        }
        expect(row.completed_at).not.toBeNull()
      }),
      { numRuns: 50 }
    )
  })

  it('dismissed reminders cannot be dismissed again', async () => {
    await fc.assert(
      fc.asyncProperty(createReminderInputArb, async (input) => {
        const created = await create(COMPANY_ID, input)
        await dismiss(COMPANY_ID, created.id)

        // Attempt to dismiss again should throw BusinessRuleError
        await expect(dismiss(COMPANY_ID, created.id)).rejects.toThrow(BusinessRuleError)
      }),
      { numRuns: 50 }
    )
  })

  it('dismissed reminders cannot be completed', async () => {
    await fc.assert(
      fc.asyncProperty(createReminderInputArb, async (input) => {
        const created = await create(COMPANY_ID, input)
        await dismiss(COMPANY_ID, created.id)

        // Attempt to complete a dismissed reminder should throw BusinessRuleError
        await expect(complete(COMPANY_ID, created.id)).rejects.toThrow(BusinessRuleError)
      }),
      { numRuns: 50 }
    )
  })

  it('completed reminders cannot be dismissed', async () => {
    await fc.assert(
      fc.asyncProperty(createReminderInputArb, async (input) => {
        const created = await create(COMPANY_ID, input)
        await complete(COMPANY_ID, created.id)

        // Attempt to dismiss a completed reminder should throw BusinessRuleError
        await expect(dismiss(COMPANY_ID, created.id)).rejects.toThrow(BusinessRuleError)
      }),
      { numRuns: 50 }
    )
  })

  it('completed reminders cannot be completed again', async () => {
    await fc.assert(
      fc.asyncProperty(createReminderInputArb, async (input) => {
        const created = await create(COMPANY_ID, input)
        await complete(COMPANY_ID, created.id)

        // Attempt to complete again should throw BusinessRuleError
        await expect(complete(COMPANY_ID, created.id)).rejects.toThrow(BusinessRuleError)
      }),
      { numRuns: 50 }
    )
  })

  it('non-active reminders (random status) cannot be dismissed or completed', async () => {
    await fc.assert(
      fc.asyncProperty(
        createReminderInputArb,
        fc.constantFrom('dismissed', 'completed') as fc.Arbitrary<'dismissed' | 'completed'>,
        async (input, targetStatus) => {
          // Create a reminder and transition it to the target non-active status
          const created = await create(COMPANY_ID, input)

          if (targetStatus === 'dismissed') {
            await dismiss(COMPANY_ID, created.id)
          } else {
            await complete(COMPANY_ID, created.id)
          }

          // Both operations should now fail
          await expect(dismiss(COMPANY_ID, created.id)).rejects.toThrow(BusinessRuleError)
          await expect(complete(COMPANY_ID, created.id)).rejects.toThrow(BusinessRuleError)
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 15: Reminder list ordering
// ---------------------------------------------------------------------------

describe('Reminder list ordering (Property 15)', () => {
  let sqlite: Database.Database
  let db: BetterSQLite3Database<typeof schema>

  beforeEach(() => {
    sqlite = createTestDb()
    db = drizzle(sqlite, { schema })
    mockedGetDb.mockReturnValue(db)
    seedCompany(sqlite)
  })

  it('list returns reminders ordered by dueDate ascending', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(createReminderInputArb, { minLength: 2, maxLength: 15 }), async (inputs) => {
        // Create reminders with random due dates
        for (const input of inputs) {
          await create(COMPANY_ID, input)
        }

        // List all reminders (no status filter to get all)
        const result = await list(COMPANY_ID, { limit: 100, offset: 0 })

        // Verify ordering: each item's dueDate <= next item's dueDate
        for (let i = 0; i < result.data.length - 1; i++) {
          const current = result.data[i].dueDate
          const next = result.data[i + 1].dueDate
          expect(current <= next).toBe(true)
        }
      }),
      { numRuns: 50 }
    )
  })

  it('list with status filter still returns ordered by dueDate ascending', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(createReminderInputArb, { minLength: 3, maxLength: 15 }),
        fc.integer({ min: 0, max: 2 }),
        async (inputs, dismissCount) => {
          // Create all reminders
          const created: Awaited<ReturnType<typeof create>>[] = []
          for (const input of inputs) {
            created.push(await create(COMPANY_ID, input))
          }

          // Dismiss some of them
          const toDismiss = Math.min(dismissCount, created.length - 1)
          for (let i = 0; i < toDismiss; i++) {
            await dismiss(COMPANY_ID, created[i].id)
          }

          // List only active reminders
          const result = await list(COMPANY_ID, {
            status: 'active',
            limit: 100,
            offset: 0
          })

          // Verify ordering: each item's dueDate <= next item's dueDate
          for (let i = 0; i < result.data.length - 1; i++) {
            const current = result.data[i].dueDate
            const next = result.data[i + 1].dueDate
            expect(current <= next).toBe(true)
          }

          // All returned should be active
          for (const item of result.data) {
            expect(item.status).toBe('active')
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('list pagination preserves ordering across pages', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(createReminderInputArb, { minLength: 5, maxLength: 15 }), async (inputs) => {
        // Create reminders
        for (const input of inputs) {
          await create(COMPANY_ID, input)
        }

        // Fetch page 1 and page 2
        const pageSize = 3
        const page1 = await list(COMPANY_ID, { limit: pageSize, offset: 0 })
        const page2 = await list(COMPANY_ID, { limit: pageSize, offset: pageSize })

        // Verify ordering within each page
        for (let i = 0; i < page1.data.length - 1; i++) {
          expect(page1.data[i].dueDate <= page1.data[i + 1].dueDate).toBe(true)
        }
        for (let i = 0; i < page2.data.length - 1; i++) {
          expect(page2.data[i].dueDate <= page2.data[i + 1].dueDate).toBe(true)
        }

        // Verify ordering across pages: last of page 1 <= first of page 2
        if (page1.data.length > 0 && page2.data.length > 0) {
          const lastPage1 = page1.data[page1.data.length - 1].dueDate
          const firstPage2 = page2.data[0].dueDate
          expect(lastPage1 <= firstPage2).toBe(true)
        }
      }),
      { numRuns: 50 }
    )
  })
})
