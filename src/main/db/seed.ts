import type Database from 'better-sqlite3'

/**
 * Default app settings inserted on first run.
 * Each entry maps to a row in the `app_settings` table.
 */
const DEFAULT_APP_SETTINGS: readonly { key: string; value: string }[] = [
  { key: 'theme', value: 'system' },
  { key: 'lastActiveCompanyId', value: 'null' }
]

/**
 * Seeds default application settings when the `app_settings` table is empty.
 * This function is idempotent — it only inserts rows on the very first run.
 */
export function seedDefaults(db: Database.Database): void {
  const row = db.prepare('SELECT COUNT(*) as count FROM app_settings').get() as { count: number }

  if (row.count > 0) {
    return
  }

  const now = new Date().toISOString()

  const insert = db.prepare('INSERT INTO app_settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)')

  const insertAll = db.transaction(() => {
    for (const setting of DEFAULT_APP_SETTINGS) {
      insert.run(setting.key, setting.value, now, now)
    }
  })

  insertAll()
}
