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
  }
}
