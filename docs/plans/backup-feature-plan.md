# Backup Feature Plan

## 1. Overview

This document plans the backup and restore feature for the Stockando Desktop application. The feature must protect two categories of critical business data:

1. **Database** — the SQLite file containing all transactional, catalog, fiscal, and configuration data
2. **Fiscal documents** — XML files of NF-e, NFC-e, and generated DANFE PDFs that must be preserved for legal compliance (minimum 5 years per Brazilian fiscal law)

## 2. Goals

- Protect business data against hardware failures, accidental deletion, and corruption
- Satisfy Brazilian fiscal retention requirements (XML and PDF preservation)
- Provide a simple, reliable user experience for backup and restore
- Keep the feature local-first, consistent with the application architecture
- Allow optional export to external storage (USB, network drive, cloud folder)

## 3. Scope

### In scope

- Full database backup (SQLite file copy)
- Fiscal document backup (XML + PDF files)
- Compressed archive format (`.tar.gz`) with cross-platform support (macOS, Linux, Windows)
- Manual backup trigger from the settings screen
- Automatic scheduled backups (configurable interval)
- Backup history with metadata (date, size, status)
- Restore from a selected backup archive
- Export backup to a user-chosen directory (external drive, cloud-synced folder)
- Backup integrity validation (checksum)
- Backup rotation and retention policy (max backups, max age)

### Out of scope (future)

- Cloud-native backup service (S3, GCS, etc.)
- Incremental/differential backups
- Cross-device sync
- Encrypted backup archives (can be added later)

## 4. Architecture

### 4.1 Where it runs

All backup logic runs in the **main process**, consistent with the project's architecture boundary. The renderer only triggers actions and displays status through the Fastify API.

### 4.2 Storage layout

```
{userData}/
├── database.sqlite              ← live database
├── backups/
│   ├── stockando-backup-2025-01-15T10-30-00.tar.gz   ← compressed archive
│   ├── stockando-backup-2025-01-14T10-30-00.tar.gz
│   └── latest.tar.gz → stockando-backup-2025-01-15T10-30-00.tar.gz
└── fiscal-documents/            ← live fiscal document storage
    ├── nfe/
    │   └── {chave_acesso}.xml
    ├── nfce/
    │   └── {chave_acesso}.xml
    └── danfe/
        └── {chave_acesso}.pdf
```

### 4.3 Archive internal structure

Each `.tar.gz` archive contains:

```
stockando-backup-2025-01-15T10-30-00/
├── database.sqlite              ← database snapshot
├── fiscal/
│   ├── nfe/
│   │   └── {chave_acesso}.xml
│   ├── nfce/
│   │   └── {chave_acesso}.xml
│   └── danfe/
│       └── {chave_acesso}.pdf
└── manifest.json                ← backup metadata
```

### 4.4 manifest.json structure

```json
{
  "version": "1.0",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "trigger": "scheduled",
  "appVersion": "0.0.1",
  "database": {
    "fileName": "database.sqlite",
    "sizeBytes": 1048576,
    "checksum": "sha256:abc123...",
    "tableCount": 28,
    "companyCount": 2,
    "invoiceCount": 150
  },
  "fiscalDocuments": {
    "nfeCount": 80,
    "nfceCount": 70,
    "danfeCount": 150,
    "totalSizeBytes": 5242880
  },
  "status": "complete"
}
```

### 4.5 Component diagram

```
┌─────────────────────────────────────────────────┐
│                  Main Process                    │
│                                                 │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │ BackupService│    │  BackupScheduler      │  │
│  │              │    │  (setInterval-based)   │  │
│  │ - create()   │    │  - start()            │  │
│  │ - restore()  │    │  - stop()             │  │
│  │ - list()     │    │  - reschedule()       │  │
│  │ - delete()   │    └───────────┬───────────┘  │
│  │ - export()   │                │              │
│  │ - validate() │◄───────────────┘              │
│  └──────┬───────┘                               │
│         │                                       │
│  ┌──────▼───────┐    ┌───────────────────────┐  │
│  │ Fastify API  │    │  SQLite (live DB)      │  │
│  │ /api/backups │    └───────────────────────┘  │
│  └──────────────┘                               │
└─────────────────────────────────────────────────┘
         ▲
         │ HTTP (127.0.0.1:3000)
         ▼
┌─────────────────────────────────────────────────┐
│                  Renderer                        │
│                                                 │
│  ┌──────────────────────────────────────┐       │
│  │  Settings > Backups page             │       │
│  │  - backup list + status              │       │
│  │  - create backup button              │       │
│  │  - restore from backup               │       │
│  │  - export to external                │       │
│  │  - configure schedule                │       │
│  └──────────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

## 5. Compression and cross-platform support

### 5.1 Archive format: tar.gz

The backup archive uses `.tar.gz` (gzip-compressed tarball) for the following reasons:

- Universal format recognized on macOS, Linux, and Windows
- Preserves directory structure and file metadata
- Good compression ratio for SQLite databases and XML files
- Streamable — can be created without needing the full uncompressed content in memory

### 5.2 Implementation: Node.js built-in

Node.js 22+ (project requires >=24.18.0) includes built-in `node:zlib` for gzip compression. For tar creation and extraction, use the `tar` npm package (maintained, cross-platform, pure JS):

```typescript
import { create, extract } from 'tar'
import { join } from 'node:path'

// Create a backup archive
async function createBackupArchive(sourceDir: string, outputPath: string): Promise<void> {
  await create(
    {
      gzip: true,
      file: outputPath,
      cwd: sourceDir,
      portable: true // ensures cross-platform compatibility
    },
    ['.'] // archive everything in sourceDir
  )
}

// Extract a backup archive
async function extractBackupArchive(archivePath: string, targetDir: string): Promise<void> {
  await extract({
    file: archivePath,
    cwd: targetDir
  })
}
```

### 5.3 Why `tar` (npm package)

| Criteria | tar (npm) | Node.js zlib + manual | Native shell tar |
|----------|-----------|----------------------|-----------------|
| Cross-platform | Yes | Partial (no tar primitives) | No (Windows lacks native tar in older versions) |
| Pure JS | Yes | Yes | No |
| Streaming | Yes | Yes | N/A |
| Portable output | Yes (`portable: true`) | Manual | OS-dependent |
| Maintenance | Isaac Z. Schlueter (npm core team) | Self-maintained | N/A |

The `tar` package is the standard choice in the Node.js ecosystem and avoids any dependency on system-installed binaries.

### 5.4 Platform-specific notes

- **Windows**: No reliance on system `tar` binary. The `tar` npm package handles everything in userland. Path separators are normalized automatically.
- **macOS**: Works natively. The resulting `.tar.gz` can also be opened with Finder's Archive Utility.
- **Linux**: Works natively. Standard `tar` CLI can also extract the archives manually if needed.

### 5.5 Compression performance targets

| Database size | Expected archive size | Expected time |
|---------------|-----------------------|---------------|
| 50 MB | ~10-15 MB | < 3s |
| 200 MB | ~40-60 MB | < 10s |
| 500 MB | ~100-150 MB | < 25s |

SQLite databases and XML files compress very well (60-80% reduction typical).

## 6. Backup strategies

### 6.1 Database backup

SQLite supports safe file-copy backup via its built-in [backup API](https://www.sqlite.org/backup.html). Using `better-sqlite3`, the approach is:

```typescript
// Safe online backup to a temp staging directory before archiving
database.backup(tempDatabasePath)
```

This creates a consistent snapshot without locking the live database or risking partial writes. The snapshot is then included in the `.tar.gz` archive.

### 6.2 Fiscal document backup

Fiscal XMLs and DANFEs are stored as regular files in `{userData}/fiscal-documents/`. The backup process copies them into a staging directory alongside the database snapshot, then archives everything into a single `.tar.gz`. Files are named by `chave de acesso` (access key), making deduplication trivial.

### 6.3 Backup creation flow

1. Create a temporary staging directory in `{userData}/backups/.tmp/`
2. Run `database.backup()` into the staging directory
3. Copy fiscal documents into `staging/fiscal/`
4. Generate `manifest.json` with checksums and metadata
5. Create `.tar.gz` archive from the staging directory using the `tar` package
6. Move the archive to `{userData}/backups/`
7. Clean up the staging directory
8. Record the backup in the `backups` table

### 6.4 Integrity validation

- **SHA-256 checksum** of the database file is stored in the manifest (inside the archive)
- On restore, the archive is extracted to a temp directory, then checksum is validated before replacing the live database
- Optionally, after extraction, open the backup SQLite in read-only mode and run `PRAGMA integrity_check`
- The archive integrity can be validated by attempting a dry-run extraction

## 7. API design

### Fastify routes (main process)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/backups` | List all backups with metadata |
| POST | `/api/backups` | Create a new backup |
| GET | `/api/backups/:id` | Get backup details |
| DELETE | `/api/backups/:id` | Delete a specific backup |
| POST | `/api/backups/:id/restore` | Restore from a backup |
| POST | `/api/backups/:id/export` | Export backup to external path |
| POST | `/api/backups/:id/validate` | Validate backup integrity |
| GET | `/api/backups/schedule` | Get current schedule config |
| PUT | `/api/backups/schedule` | Update schedule configuration |

### Schedule configuration shape

```json
{
  "enabled": true,
  "intervalHours": 24,
  "retentionDays": 30,
  "maxBackups": 10,
  "lastRunAt": "2025-01-15T10:30:00.000Z",
  "nextRunAt": "2025-01-16T10:30:00.000Z"
}
```

## 8. User experience

### 8.1 Settings > Backups page

The backup management UI lives under the settings section:

- **Backup list** — table with date, trigger type, size, and status
- **Create backup** — button to trigger immediate backup with progress indicator
- **Restore** — select a backup, confirm via dialog, app restarts after restore
- **Export** — opens native file dialog to choose destination folder
- **Schedule config** — toggle automatic backups, set interval, retention policy
- **Status indicators** — last backup date, next scheduled backup, health check

### 8.2 Notifications

- Success/failure toast after manual backup
- Warning notification if no backup has been taken in X days
- Alert when backup storage exceeds a threshold

### 8.3 Restore flow

1. User selects a backup archive from list
2. Confirmation dialog with backup details and warnings
3. App extracts the `.tar.gz` to a temporary directory
4. App validates the backup integrity (checksum + pragma check on extracted database)
5. App closes the live database connection
6. Live database is replaced with the extracted snapshot
7. Fiscal documents from backup are merged/restored to `{userData}/fiscal-documents/`
8. Temporary extraction directory is cleaned up
9. App restarts automatically

## 9. Database schema additions

A new table to track backup history:

```typescript
export const backups = sqliteTable(
  'backups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    backupPath: text('backup_path').notNull(),
    trigger: text('trigger').notNull(), // 'manual' | 'scheduled'
    status: text('status').notNull().default('in_progress'), // 'in_progress' | 'complete' | 'failed'
    databaseSizeBytes: integer('database_size_bytes'),
    fiscalDocumentCount: integer('fiscal_document_count'),
    checksum: text('checksum'),
    errorMessage: text('error_message'),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('backups_company_idx').on(t.companyId),
    index('backups_status_idx').on(t.status),
    index('backups_created_at_idx').on(t.createdAt)
  ]
)
```

## 10. Implementation phases

### Phase 1 — Core backup and restore

- Implement `BackupService` in main process
- Database snapshot using `better-sqlite3` backup API
- Fiscal document directory copy to staging
- `.tar.gz` archive creation using the `tar` npm package
- Manifest generation with checksums
- Fastify routes for create, list, delete, restore
- Archive extraction and restore flow
- Basic backup settings page in renderer
- Manual backup and restore flow

### Phase 2 — Scheduling and retention

- Implement `BackupScheduler` with configurable interval
- Store schedule config in `companySettings` or a dedicated settings table
- Auto-cleanup of old backups based on retention policy
- Schedule management UI

### Phase 3 — Export and validation

- Export `.tar.gz` to external directory (USB, network, cloud-synced folder)
- Import backup archive from external source
- Integrity validation on demand (extract + checksum + pragma check)
- Backup health dashboard (last backup age, total backup size)
- Warning notifications for stale backups

## 11. Fiscal compliance notes

Brazilian fiscal legislation (specifically SEFAZ/CONFAZ norms) requires:

- **NF-e XML**: must be stored for at least 5 years from the issuance date
- **NFC-e XML**: same 5-year retention
- **DANFE PDF**: recommended but not legally required (XML is the canonical document)

The backup system should:

- Never delete fiscal XMLs that are within the retention window
- Track fiscal document counts per backup
- Warn the user if a restore would potentially lose fiscal documents
- Support "fiscal-only" exports for accountant handoff scenarios

## 12. Security considerations

- Backups contain all business data — treat backup files as sensitive
- Future enhancement: optional AES-256 encryption of backup archives
- Backup path should not be exposed in the renderer beyond display
- Validate input paths for export to prevent directory traversal

## 13. Open questions

1. Should the backup include attachments (uploaded files linked to entities), or only database + fiscal docs?
2. Should the system support per-company backups, or always back up the entire database?
3. What is the desired UX for restore failure (corrupted archive or checksum mismatch)?
4. Should the app support importing a backup from a different machine (migration scenario)?

## 14. Dependencies

- `better-sqlite3` — already in the project, supports the backup API
- `tar` — pure JS tar creation/extraction, cross-platform (macOS, Linux, Windows)
- `node:fs/promises` + `node:crypto` — for file operations and checksums
- `node:zlib` — used internally by `tar` for gzip compression

Only one new dependency is required: the `tar` npm package.

## 15. Success criteria

- Manual backup completes in under 30 seconds for a database up to 500MB
- Restore returns the application to a consistent state
- No data loss on fiscal documents within retention window
- Schedule runs reliably while the app is open
- User receives clear feedback on all backup operations
