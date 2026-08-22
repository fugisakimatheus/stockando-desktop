import type { Migration } from './index'

export const migration001: Migration = {
  version: 1,
  name: '001-initial-schema',
  up(db) {
    db.exec(`PRAGMA foreign_keys = ON`)

    // -----------------------------------------------------------------------
    // app_settings — application-level key/value settings (not company-scoped)
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // -----------------------------------------------------------------------
    // companies — top-level company records
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        document_number TEXT NOT NULL,
        trade_name TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS companies_document_number_unique ON companies (document_number)`)
    db.exec(`CREATE INDEX IF NOT EXISTS companies_status_idx ON companies (status)`)

    // -----------------------------------------------------------------------
    // company_settings — per-company configuration
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
        company_name TEXT NOT NULL,
        tax_regime TEXT,
        currency_code TEXT NOT NULL DEFAULT 'BRL',
        fiscal_environment TEXT NOT NULL DEFAULT 'production',
        invoice_series TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // -----------------------------------------------------------------------
    // users — users scoped to a company
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'admin',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_company_email_unique ON users (company_id, email)`)
    db.exec(`CREATE INDEX IF NOT EXISTS users_company_idx ON users (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS users_role_idx ON users (role)`)

    // -----------------------------------------------------------------------
    // roles — roles scoped to a company
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        is_system INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS roles_company_name_unique ON roles (company_id, name)`)
    db.exec(`CREATE INDEX IF NOT EXISTS roles_company_idx ON roles (company_id)`)

    // -----------------------------------------------------------------------
    // role_permissions — permissions assigned to roles
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_permission_unique ON role_permissions (role_id, permission)`
    )

    // -----------------------------------------------------------------------
    // customers
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
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
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS customers_company_document_unique ON customers (company_id, document_number)`
    )
    db.exec(`CREATE INDEX IF NOT EXISTS customers_company_idx ON customers (company_id)`)

    // -----------------------------------------------------------------------
    // suppliers
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
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
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_document_unique ON suppliers (company_id, document_number)`
    )
    db.exec(`CREATE INDEX IF NOT EXISTS suppliers_company_idx ON suppliers (company_id)`)

    // -----------------------------------------------------------------------
    // categories
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        parent_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // -----------------------------------------------------------------------
    // units_of_measure
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS units_of_measure (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // -----------------------------------------------------------------------
    // products
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
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
      )
    `)

    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_unique ON products (company_id, sku)`)
    db.exec(`CREATE INDEX IF NOT EXISTS products_company_idx ON products (company_id)`)

    // -----------------------------------------------------------------------
    // warehouses
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        address TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS warehouses_company_code_unique ON warehouses (company_id, code)`)

    // -----------------------------------------------------------------------
    // stock
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        quantity REAL NOT NULL DEFAULT 0,
        reserved_quantity REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS stock_company_product_warehouse_unique ON stock (company_id, product_id, warehouse_id)`
    )

    // -----------------------------------------------------------------------
    // stock_movements
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        movement_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL,
        reference_type TEXT,
        reference_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS stock_movements_company_idx ON stock_movements (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements (product_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS stock_movements_warehouse_idx ON stock_movements (warehouse_id)`)

    // -----------------------------------------------------------------------
    // stock_adjustments
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        adjustment_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL,
        reason TEXT NOT NULL,
        notes TEXT,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS stock_adjustments_company_idx ON stock_adjustments (company_id)`)

    // -----------------------------------------------------------------------
    // payment_methods
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_company_code_unique ON payment_methods (company_id, code)`
    )

    // -----------------------------------------------------------------------
    // quotes
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        quote_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        valid_until TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS quotes_company_quote_number_unique ON quotes (company_id, quote_number)`)
    db.exec(`CREATE INDEX IF NOT EXISTS quotes_company_idx ON quotes (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS quotes_customer_idx ON quotes (customer_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS quotes_status_idx ON quotes (status)`)

    // -----------------------------------------------------------------------
    // quote_items
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS quote_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS quote_items_quote_idx ON quote_items (quote_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS quote_items_product_idx ON quote_items (product_id)`)

    // -----------------------------------------------------------------------
    // orders (sales orders)
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS orders_company_order_number_unique ON orders (company_id, order_number)`)
    db.exec(`CREATE INDEX IF NOT EXISTS orders_company_idx ON orders (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)`)

    // -----------------------------------------------------------------------
    // order_items
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items (product_id)`)

    // -----------------------------------------------------------------------
    // order_payments
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS order_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        transaction_reference TEXT,
        paid_at TEXT,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS order_payments_order_idx ON order_payments (order_id)`)

    // -----------------------------------------------------------------------
    // quote_order_conversions
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS quote_order_conversions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        converted_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS quote_order_conversions_quote_unique ON quote_order_conversions (quote_id)`
    )
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS quote_order_conversions_order_unique ON quote_order_conversions (order_id)`
    )

    // -----------------------------------------------------------------------
    // purchase_orders
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_company_order_unique ON purchase_orders (company_id, order_number)`
    )
    db.exec(`CREATE INDEX IF NOT EXISTS purchase_orders_company_idx ON purchase_orders (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON purchase_orders (supplier_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS purchase_orders_status_idx ON purchase_orders (status)`)

    // -----------------------------------------------------------------------
    // purchase_order_items
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE INDEX IF NOT EXISTS purchase_order_items_purchase_order_idx ON purchase_order_items (purchase_order_id)`
    )
    db.exec(`CREATE INDEX IF NOT EXISTS purchase_order_items_product_idx ON purchase_order_items (product_id)`)

    // -----------------------------------------------------------------------
    // numbering_sequences
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS numbering_sequences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        sequence_type TEXT NOT NULL,
        current_value INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS numbering_sequences_company_type_unique ON numbering_sequences (company_id, sequence_type)`
    )

    // -----------------------------------------------------------------------
    // audit_logs — change history for critical entities
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        details TEXT,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS audit_logs_company_idx ON audit_logs (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs (user_id)`)

    // -----------------------------------------------------------------------
    // tax_rules
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS tax_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        tax_type TEXT NOT NULL,
        rate REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS tax_rules_company_idx ON tax_rules (company_id)`)

    // -----------------------------------------------------------------------
    // digital_certificates
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS digital_certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        certificate_path TEXT NOT NULL,
        password_encrypted TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_until TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS digital_certificates_company_idx ON digital_certificates (company_id)`)

    // -----------------------------------------------------------------------
    // invoices (fiscal documents)
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        digital_certificate_id INTEGER REFERENCES digital_certificates(id) ON DELETE SET NULL,
        tax_rule_id INTEGER REFERENCES tax_rules(id) ON DELETE SET NULL,
        document_type TEXT NOT NULL,
        document_number TEXT NOT NULL,
        access_key TEXT,
        issue_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        subtotal REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_document_unique ON invoices (company_id, document_type, document_number)`
    )
    db.exec(`CREATE INDEX IF NOT EXISTS invoices_company_idx ON invoices (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status)`)

    // -----------------------------------------------------------------------
    // invoice_items
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        tax_amount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items (invoice_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS invoice_items_product_idx ON invoice_items (product_id)`)

    // -----------------------------------------------------------------------
    // financial_accounts
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS financial_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        bank_name TEXT,
        initial_balance REAL NOT NULL DEFAULT 0,
        current_balance REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS financial_accounts_company_idx ON financial_accounts (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS financial_accounts_status_idx ON financial_accounts (status)`)

    // -----------------------------------------------------------------------
    // financial_transactions
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS financial_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        account_id INTEGER NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
        transaction_type TEXT NOT NULL,
        reference_type TEXT,
        reference_id TEXT,
        amount REAL NOT NULL,
        description TEXT,
        transaction_date TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS financial_transactions_company_idx ON financial_transactions (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS financial_transactions_account_idx ON financial_transactions (account_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS financial_transactions_date_idx ON financial_transactions (transaction_date)`)

    // -----------------------------------------------------------------------
    // document_series
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        document_type TEXT NOT NULL,
        series TEXT NOT NULL,
        current_number INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS document_series_company_type_series_unique ON document_series (company_id, document_type, series)`
    )

    // -----------------------------------------------------------------------
    // price_rules
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS price_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        rule_type TEXT NOT NULL,
        value REAL NOT NULL,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        valid_from TEXT,
        valid_until TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS price_rules_company_idx ON price_rules (company_id)`)

    // -----------------------------------------------------------------------
    // attachments
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS attachments_company_idx ON attachments (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS attachments_entity_idx ON attachments (entity_type, entity_id)`)

    // -----------------------------------------------------------------------
    // dashboard_aggregates
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS dashboard_aggregates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        period_key TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value REAL NOT NULL,
        computed_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS dashboard_aggregates_company_period_metric_unique ON dashboard_aggregates (company_id, period_key, metric_name)`
    )
    db.exec(`CREATE INDEX IF NOT EXISTS dashboard_aggregates_company_idx ON dashboard_aggregates (company_id)`)

    // -----------------------------------------------------------------------
    // automation_rules
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS automation_rules (
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
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS automation_rules_company_idx ON automation_rules (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS automation_rules_company_enabled_idx ON automation_rules (company_id, enabled)`)

    // -----------------------------------------------------------------------
    // rule_evaluations
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS rule_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id INTEGER NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action_taken TEXT NOT NULL,
        evaluated_at TEXT NOT NULL
      )
    `)

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS rule_evaluations_rule_entity_unique ON rule_evaluations (rule_id, entity_type, entity_id)`
    )
    db.exec(`CREATE INDEX IF NOT EXISTS rule_evaluations_rule_idx ON rule_evaluations (rule_id)`)

    // -----------------------------------------------------------------------
    // reminders
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS reminders (
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
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS reminders_company_idx ON reminders (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS reminders_company_status_idx ON reminders (company_id, status)`)
    db.exec(`CREATE INDEX IF NOT EXISTS reminders_company_due_date_idx ON reminders (company_id, due_date)`)
    db.exec(`CREATE INDEX IF NOT EXISTS reminders_rule_idx ON reminders (rule_id)`)

    // -----------------------------------------------------------------------
    // integration_configs
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS integration_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        provider_type TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        credentials_ref TEXT,
        description TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        last_tested_at TEXT,
        last_test_result TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS integration_configs_company_idx ON integration_configs (company_id)`)
    db.exec(
      `CREATE INDEX IF NOT EXISTS integration_configs_company_provider_idx ON integration_configs (company_id, provider_type)`
    )

    // -----------------------------------------------------------------------
    // import_jobs
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS import_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        file_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        total_rows INTEGER,
        imported_rows INTEGER,
        skipped_rows INTEGER,
        failed_rows INTEGER,
        error_details TEXT,
        created_at TEXT NOT NULL
      )
    `)

    db.exec(`CREATE INDEX IF NOT EXISTS import_jobs_company_idx ON import_jobs (company_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS import_jobs_company_status_idx ON import_jobs (company_id, status)`)
  }
}
