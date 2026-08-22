/**
 * Property tests for automation rule evaluation.
 *
 * **Validates: Requirements 7.2, 7.4, 8.1, 8.2, 8.4**
 *
 * Property 11: Automation rule idempotent execution
 * "Evaluating the same rule twice does not create duplicate actions for the same
 * entity. The rule_evaluations count and reminders count remain the same after
 * a second evaluation cycle."
 *
 * Property 12: Automation trigger correctness — installment_overdue
 * "Only installments that are pending and past due by at least N days trigger
 * the rule. Installments due within the threshold or with non-pending status
 * are not matched."
 *
 * Property 13: Automation trigger correctness — stock_below_minimum
 * "Only products where the total stock across all warehouses is below the
 * configured minimum quantity trigger the rule. Products at or above the
 * minimum are not matched."
 *
 * Property 20: Automation rule validation
 * "Creating a rule with invalid trigger/action params (negative overdueDays,
 * zero minimumQuantity, empty messageTemplate, etc.) throws ValidationError."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

import { ValidationError } from '../../api/errors'
import { getDb } from '../../server'
import { create, evaluate } from '../automation-service'

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

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      document_number TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      customer_type TEXT NOT NULL DEFAULT 'individual',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      document_number TEXT NOT NULL,
      trade_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE units_of_measure (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      unit_id INTEGER REFERENCES units_of_measure(id) ON DELETE SET NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      barcode TEXT,
      cost_price REAL,
      sale_price REAL,
      track_inventory INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX products_company_sku_unique ON products(company_id, sku);

    CREATE TABLE warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      quantity REAL NOT NULL DEFAULT 0,
      reserved_quantity REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX stock_company_product_warehouse_unique ON stock(company_id, product_id, warehouse_id);

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      order_number TEXT NOT NULL,
      order_type TEXT NOT NULL DEFAULT 'sale',
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      confirmed_at TEXT,
      fulfilled_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX orders_company_order_number_unique ON orders(company_id, order_number);

    CREATE TABLE purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      order_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      expected_delivery_date TEXT,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX purchase_orders_company_order_unique ON purchase_orders(company_id, order_number);

    CREATE TABLE installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL,
      order_type TEXT NOT NULL,
      installment_number INTEGER NOT NULL,
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      settled_at TEXT,
      account_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX installments_company_order_idx ON installments(company_id, order_id, order_type);
    CREATE INDEX installments_company_status_idx ON installments(company_id, status);
    CREATE INDEX installments_company_type_status_idx ON installments(company_id, order_type, status);

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
    CREATE INDEX automation_rules_company_enabled_idx ON automation_rules(company_id, enabled);

    CREATE TABLE rule_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action_taken TEXT NOT NULL,
      evaluated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX rule_evaluations_rule_entity_unique ON rule_evaluations(rule_id, entity_type, entity_id);
    CREATE INDEX rule_evaluations_rule_idx ON rule_evaluations(rule_id);

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
// Helpers
// ---------------------------------------------------------------------------

function countRows(sqlite: Database.Database, table: string): number {
  const row = sqlite.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }
  return row.cnt
}

function countRuleEvaluations(sqlite: Database.Database, ruleId: number): number {
  const row = sqlite.prepare(`SELECT COUNT(*) as cnt FROM rule_evaluations WHERE rule_id = ?`).get(ruleId) as {
    cnt: number
  }
  return row.cnt
}

function countReminders(sqlite: Database.Database): number {
  return countRows(sqlite, 'reminders')
}

// ---------------------------------------------------------------------------
// Property 11: Automation rule idempotent execution
// ---------------------------------------------------------------------------

describe('Automation rule idempotent execution (Property 11)', () => {
  it('evaluating the same rule twice does not create duplicate actions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 30 }),
        async (installmentCount, overdueDays) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          // Insert a rule: installment_overdue -> create_reminder
          const now = new Date().toISOString()
          sqlite.exec(`
            INSERT INTO automation_rules (company_id, name, trigger_type, trigger_params, action_type, action_params, enabled, created_at, updated_at)
            VALUES (
              ${COMPANY_ID},
              'Overdue Rule',
              'installment_overdue',
              '${JSON.stringify({ overdueDays })}',
              'create_reminder',
              '${JSON.stringify({ messageTemplate: 'Overdue: {entitySummary}' })}',
              1,
              '${now}',
              '${now}'
            );
          `)

          // Insert installments that are all overdue beyond the threshold
          const pastDate = new Date()
          pastDate.setDate(pastDate.getDate() - overdueDays - 5)
          const pastDateStr = pastDate.toISOString().split('T')[0]

          for (let i = 0; i < installmentCount; i++) {
            sqlite.exec(`
              INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
              VALUES (${COMPANY_ID}, ${i + 1}, 'sale', 1, 100.00, '${pastDateStr}', 'pending', '${now}', '${now}');
            `)
          }

          try {
            // First evaluation
            const firstResult = await evaluate(COMPANY_ID)
            const evalsAfterFirst = countRuleEvaluations(sqlite, 1)
            const remindersAfterFirst = countReminders(sqlite)

            expect(firstResult.actionsExecuted).toBe(installmentCount)
            expect(evalsAfterFirst).toBe(installmentCount)
            expect(remindersAfterFirst).toBe(installmentCount)

            // Second evaluation — should not duplicate
            const secondResult = await evaluate(COMPANY_ID)
            const evalsAfterSecond = countRuleEvaluations(sqlite, 1)
            const remindersAfterSecond = countReminders(sqlite)

            expect(secondResult.actionsExecuted).toBe(0)
            expect(evalsAfterSecond).toBe(evalsAfterFirst)
            expect(remindersAfterSecond).toBe(remindersAfterFirst)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 12: Automation trigger correctness — installment_overdue
// ---------------------------------------------------------------------------

describe('Automation trigger correctness — installment_overdue (Property 12)', () => {
  it('only installments past due by at least N days trigger the rule', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 30 }),
        fc.array(
          fc.record({
            /** daysBefore: how many days before today the due date is. Positive = overdue. */
            daysBefore: fc.integer({ min: -10, max: 60 }),
            status: fc.constantFrom('pending', 'settled', 'cancelled')
          }),
          { minLength: 1, maxLength: 15 }
        ),
        async (overdueDays, installmentSpecs) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          const now = new Date()
          const nowStr = now.toISOString()

          // Insert the rule
          sqlite.exec(`
            INSERT INTO automation_rules (company_id, name, trigger_type, trigger_params, action_type, action_params, enabled, created_at, updated_at)
            VALUES (
              ${COMPANY_ID},
              'Overdue Rule',
              'installment_overdue',
              '${JSON.stringify({ overdueDays })}',
              'create_reminder',
              '${JSON.stringify({ messageTemplate: 'Overdue: {entitySummary}' })}',
              1,
              '${nowStr}',
              '${nowStr}'
            );
          `)

          // Insert installments with varying due dates and statuses
          const expectedTriggeredIds: string[] = []

          for (let i = 0; i < installmentSpecs.length; i++) {
            const spec = installmentSpecs[i]
            const dueDate = new Date(now)
            dueDate.setDate(dueDate.getDate() - spec.daysBefore)
            const dueDateStr = dueDate.toISOString().split('T')[0]

            sqlite.exec(`
              INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
              VALUES (${COMPANY_ID}, ${i + 1}, 'sale', 1, 100.00, '${dueDateStr}', '${spec.status}', '${nowStr}', '${nowStr}');
            `)

            // An installment triggers when:
            // 1. status is 'pending'
            // 2. dueDate < (today - overdueDays), i.e. daysBefore > overdueDays
            const cutoffDate = new Date(now)
            cutoffDate.setDate(cutoffDate.getDate() - overdueDays)
            const cutoffIso = cutoffDate.toISOString().split('T')[0]

            if (spec.status === 'pending' && dueDateStr < cutoffIso) {
              expectedTriggeredIds.push(String(i + 1))
            }
          }

          try {
            await evaluate(COMPANY_ID)

            // Check which entities got evaluations
            const evals = sqlite.prepare('SELECT entity_id FROM rule_evaluations WHERE rule_id = 1').all() as {
              entity_id: string
            }[]
            const triggeredIds = evals.map((e) => e.entity_id).sort()
            const expectedSorted = expectedTriggeredIds.sort()

            expect(triggeredIds).toEqual(expectedSorted)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 13: Automation trigger correctness — stock_below_minimum
// ---------------------------------------------------------------------------

describe('Automation trigger correctness — stock_below_minimum (Property 13)', () => {
  it('only products with total stock below the configured minimum trigger the rule', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.array(
          fc.record({
            /** Stock quantities in different warehouses */
            warehouseQuantities: fc.array(fc.integer({ min: 0, max: 200 }), {
              minLength: 1,
              maxLength: 3
            }),
            trackInventory: fc.boolean()
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (minimumQuantity, productSpecs) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          const nowStr = new Date().toISOString()

          // Insert the rule
          sqlite.exec(`
            INSERT INTO automation_rules (company_id, name, trigger_type, trigger_params, action_type, action_params, enabled, created_at, updated_at)
            VALUES (
              ${COMPANY_ID},
              'Low Stock Rule',
              'stock_below_minimum',
              '${JSON.stringify({ minimumQuantity })}',
              'create_reminder',
              '${JSON.stringify({ messageTemplate: 'Low stock: {entitySummary}' })}',
              1,
              '${nowStr}',
              '${nowStr}'
            );
          `)

          // Create warehouses
          const maxWarehouses = Math.max(...productSpecs.map((p) => p.warehouseQuantities.length))
          for (let w = 0; w < maxWarehouses; w++) {
            sqlite.exec(`
              INSERT INTO warehouses (company_id, name, code, status, created_at, updated_at)
              VALUES (${COMPANY_ID}, 'Warehouse ${w + 1}', 'WH-${w + 1}', 'active', '${nowStr}', '${nowStr}');
            `)
          }

          // Insert products and stock
          const expectedTriggeredIds: string[] = []

          for (let p = 0; p < productSpecs.length; p++) {
            const spec = productSpecs[p]
            const trackInventory = spec.trackInventory ? 1 : 0

            sqlite.exec(`
              INSERT INTO products (company_id, sku, name, track_inventory, status, created_at, updated_at)
              VALUES (${COMPANY_ID}, 'SKU-${p}', 'Product ${p}', ${trackInventory}, 'active', '${nowStr}', '${nowStr}');
            `)

            const productId = p + 1

            // Insert stock records for each warehouse
            let totalStock = 0
            for (let w = 0; w < spec.warehouseQuantities.length; w++) {
              const qty = spec.warehouseQuantities[w]
              totalStock += qty

              sqlite.exec(`
                INSERT INTO stock (company_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
                VALUES (${COMPANY_ID}, ${productId}, ${w + 1}, ${qty}, 0, '${nowStr}', '${nowStr}');
              `)
            }

            // A product triggers when:
            // 1. trackInventory is true
            // 2. total stock across warehouses < minimumQuantity
            if (spec.trackInventory && totalStock < minimumQuantity) {
              expectedTriggeredIds.push(String(productId))
            }
          }

          try {
            await evaluate(COMPANY_ID)

            // Check which entities got evaluations
            const evals = sqlite.prepare('SELECT entity_id FROM rule_evaluations WHERE rule_id = 1').all() as {
              entity_id: string
            }[]
            const triggeredIds = evals.map((e) => e.entity_id).sort()
            const expectedSorted = expectedTriggeredIds.sort()

            expect(triggeredIds).toEqual(expectedSorted)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 20: Automation rule validation
// ---------------------------------------------------------------------------

describe('Automation rule validation (Property 20)', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = createTestDb()
    const db = drizzle(sqlite, { schema })
    mockedGetDb.mockReturnValue(db)
    seedCompany(sqlite)
  })

  it('rejects invalid trigger params — negative or zero overdueDays', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -100, max: 0 }), async (invalidDays) => {
        await expect(
          create(COMPANY_ID, {
            name: 'Test Rule',
            triggerType: 'installment_overdue',
            triggerParams: { overdueDays: invalidDays },
            actionType: 'create_reminder',
            actionParams: { messageTemplate: 'Alert: {entitySummary}' }
          })
        ).rejects.toThrow(ValidationError)
      }),
      { numRuns: 30 }
    )
  })

  it('rejects invalid trigger params — negative or zero minimumQuantity', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -100, max: 0 }), async (invalidQty) => {
        await expect(
          create(COMPANY_ID, {
            name: 'Test Rule',
            triggerType: 'stock_below_minimum',
            triggerParams: { minimumQuantity: invalidQty },
            actionType: 'create_reminder',
            actionParams: { messageTemplate: 'Alert: {entitySummary}' }
          })
        ).rejects.toThrow(ValidationError)
      }),
      { numRuns: 30 }
    )
  })

  it('rejects invalid trigger params — negative or zero pendingDays', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -100, max: 0 }), async (invalidDays) => {
        await expect(
          create(COMPANY_ID, {
            name: 'Test Rule',
            triggerType: 'order_pending_too_long',
            triggerParams: { pendingDays: invalidDays },
            actionType: 'create_reminder',
            actionParams: { messageTemplate: 'Alert: {entitySummary}' }
          })
        ).rejects.toThrow(ValidationError)
      }),
      { numRuns: 30 }
    )
  })

  it('rejects invalid action params — empty messageTemplate', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('', '   ', '\t', '\n'), async (invalidTemplate) => {
        await expect(
          create(COMPANY_ID, {
            name: 'Test Rule',
            triggerType: 'installment_overdue',
            triggerParams: { overdueDays: 7 },
            actionType: 'create_reminder',
            actionParams: { messageTemplate: invalidTemplate }
          })
        ).rejects.toThrow(ValidationError)
      }),
      { numRuns: 10 }
    )
  })

  it('rejects invalid action params — empty notificationTemplate', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('', '   ', '\t', '\n'), async (invalidTemplate) => {
        await expect(
          create(COMPANY_ID, {
            name: 'Test Rule',
            triggerType: 'installment_overdue',
            triggerParams: { overdueDays: 7 },
            actionType: 'log_notification',
            actionParams: { notificationTemplate: invalidTemplate }
          })
        ).rejects.toThrow(ValidationError)
      }),
      { numRuns: 10 }
    )
  })

  it('rejects invalid trigger type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => s !== 'installment_overdue' && s !== 'stock_below_minimum' && s !== 'order_pending_too_long'),
        async (invalidType) => {
          await expect(
            create(COMPANY_ID, {
              name: 'Test Rule',
              triggerType: invalidType as 'installment_overdue',
              triggerParams: { overdueDays: 7 } as never,
              actionType: 'create_reminder',
              actionParams: { messageTemplate: 'Alert' }
            })
          ).rejects.toThrow(ValidationError)
        }
      ),
      { numRuns: 30 }
    )
  })

  it('rejects invalid action type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s !== 'create_reminder' && s !== 'log_notification'),
        async (invalidType) => {
          await expect(
            create(COMPANY_ID, {
              name: 'Test Rule',
              triggerType: 'installment_overdue',
              triggerParams: { overdueDays: 7 },
              actionType: invalidType as 'create_reminder',
              actionParams: { messageTemplate: 'Alert' } as never
            })
          ).rejects.toThrow(ValidationError)
        }
      ),
      { numRuns: 30 }
    )
  })
})
