import type { Migration } from './index'

export const migration002: Migration = {
  version: 2,
  name: '002-phase2-commercial',
  up(db) {
    // -----------------------------------------------------------------------
    // orders — add lifecycle timestamp columns
    // -----------------------------------------------------------------------
    db.exec(`ALTER TABLE orders ADD COLUMN confirmed_at TEXT`)
    db.exec(`ALTER TABLE orders ADD COLUMN fulfilled_at TEXT`)
    db.exec(`ALTER TABLE orders ADD COLUMN cancelled_at TEXT`)

    // -----------------------------------------------------------------------
    // quotes — add lifecycle timestamp columns
    // -----------------------------------------------------------------------
    db.exec(`ALTER TABLE quotes ADD COLUMN cancelled_at TEXT`)
    db.exec(`ALTER TABLE quotes ADD COLUMN converted_at TEXT`)

    // -----------------------------------------------------------------------
    // purchase_orders — add lifecycle timestamp column
    // -----------------------------------------------------------------------
    db.exec(`ALTER TABLE purchase_orders ADD COLUMN cancelled_at TEXT`)

    // -----------------------------------------------------------------------
    // purchase_order_items — add received quantity tracking
    // -----------------------------------------------------------------------
    db.exec(`ALTER TABLE purchase_order_items ADD COLUMN received_quantity REAL NOT NULL DEFAULT 0`)

    // -----------------------------------------------------------------------
    // purchase_order_payments — payment tracking for purchase orders
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_order_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        transaction_reference TEXT,
        paid_at TEXT,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE INDEX IF NOT EXISTS purchase_order_payments_purchase_order_idx ON purchase_order_payments (purchase_order_id)`
    )
    db.exec(
      `CREATE INDEX IF NOT EXISTS purchase_order_payments_payment_method_idx ON purchase_order_payments (payment_method_id)`
    )
  }
}
