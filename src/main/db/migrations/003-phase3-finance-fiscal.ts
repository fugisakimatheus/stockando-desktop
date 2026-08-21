import type { Migration } from './index'

export const migration003: Migration = {
  version: 3,
  name: '003-phase3-finance-fiscal',
  up(db) {
    // -----------------------------------------------------------------------
    // installments — payment plan entries for orders
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS installments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        order_id INTEGER NOT NULL,
        order_type TEXT NOT NULL,
        installment_number INTEGER NOT NULL,
        amount REAL NOT NULL,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        settled_at TEXT,
        account_id INTEGER REFERENCES financial_accounts(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE INDEX IF NOT EXISTS installments_company_order_idx ON installments (company_id, order_id, order_type)`
    )
    db.exec(`CREATE INDEX IF NOT EXISTS installments_company_status_idx ON installments (company_id, status)`)

    // -----------------------------------------------------------------------
    // invoice_events — fiscal document lifecycle events
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        protocol_number TEXT,
        justification TEXT,
        event_date TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS invoice_events_invoice_idx ON invoice_events (invoice_id)`)

    // -----------------------------------------------------------------------
    // invoices — add fiscal lifecycle columns
    // -----------------------------------------------------------------------
    db.exec(`ALTER TABLE invoices ADD COLUMN series TEXT`)
    db.exec(`ALTER TABLE invoices ADD COLUMN protocol_number TEXT`)
    db.exec(`ALTER TABLE invoices ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`)
    db.exec(`ALTER TABLE invoices ADD COLUMN authorized_at TEXT`)
    db.exec(`ALTER TABLE invoices ADD COLUMN cancelled_at TEXT`)
    db.exec(`ALTER TABLE invoices ADD COLUMN cancellation_justification TEXT`)

    // -----------------------------------------------------------------------
    // attachments — add file size tracking
    // -----------------------------------------------------------------------
    db.exec(`ALTER TABLE attachments ADD COLUMN file_size INTEGER`)

    // -----------------------------------------------------------------------
    // Performance indexes — composite indexes for query optimization
    // -----------------------------------------------------------------------
    db.exec(`CREATE INDEX IF NOT EXISTS invoices_company_status_date_idx ON invoices (company_id, status, issue_date)`)
    db.exec(`CREATE INDEX IF NOT EXISTS audit_logs_entity_date_idx ON audit_logs (entity_type, entity_id, created_at)`)
    db.exec(
      `CREATE INDEX IF NOT EXISTS installments_company_type_status_idx ON installments (company_id, order_type, status)`
    )
    db.exec(
      `CREATE INDEX IF NOT EXISTS financial_transactions_account_date_idx ON financial_transactions (account_id, transaction_date)`
    )
  }
}
