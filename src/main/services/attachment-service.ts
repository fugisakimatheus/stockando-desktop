/**
 * AttachmentService — manages file attachments for business entities.
 *
 * Supports listing, creating, and deleting attachments scoped to a company.
 * Files are stored on the local filesystem in a structured directory layout.
 * Audit entries are recorded on create and delete operations.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { and, eq } from 'drizzle-orm'
import { app } from 'electron'

import { NotFoundError, ValidationError } from '../api/errors'
import { attachments } from '../db/schema'
import { getDb } from '../server'
import type { AttachmentRecord, CreateAttachmentInput } from '../types/finance'
import { ATTACHMENT_ENTITY_TYPES } from '../types/finance'
import { logAudit } from './audit-service'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum file size in bytes (10 MB). */
const MAX_FILE_SIZE = 10 * 1024 * 1024

const VALID_ENTITY_TYPES = new Set(Object.values(ATTACHMENT_ENTITY_TYPES))

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all attachments for the given entity, scoped to the active company.
 */
export async function listForEntity(
  companyId: number,
  entityType: string,
  entityId: string
): Promise<AttachmentRecord[]> {
  const db = getDb()

  const rows = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.companyId, companyId),
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId)
      )
    )

  return rows.map(mapToRecord)
}

/**
 * Creates a new attachment record and copies the source file to structured storage.
 *
 * Validates:
 * - Entity type is one of the supported types
 * - Source file exists and does not exceed MAX_FILE_SIZE (10 MB)
 *
 * Records an audit log entry after successful creation.
 */
export async function create(companyId: number, input: CreateAttachmentInput): Promise<AttachmentRecord> {
  const db = getDb()

  // Validate entity type
  if (!VALID_ENTITY_TYPES.has(input.entityType)) {
    throw new ValidationError(
      `Invalid entity type "${input.entityType}". Allowed: ${[...VALID_ENTITY_TYPES].join(', ')}`,
      { entityType: 'Invalid entity type' }
    )
  }

  // Check file exists and size
  let stat: Awaited<ReturnType<typeof fs.stat>>
  try {
    stat = await fs.stat(input.filePath)
  } catch {
    throw new ValidationError('Source file does not exist or is not accessible', {
      filePath: 'File not found'
    })
  }

  if (stat.size > MAX_FILE_SIZE) {
    throw new ValidationError(
      `File size (${stat.size} bytes) exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes (10 MB)`,
      { filePath: 'File exceeds maximum size of 10 MB' }
    )
  }

  // Compute destination path and ensure directory exists
  const destPath = getFilePath(companyId, input.entityType, input.entityId, input.fileName)
  const absoluteDest = join(getDataDir(), destPath)

  await fs.mkdir(join(absoluteDest, '..'), { recursive: true })

  // Copy file to structured storage
  await fs.cp(input.filePath, absoluteDest)

  // Insert attachment record
  const now = new Date().toISOString()

  const result = await db
    .insert(attachments)
    .values({
      companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      fileName: input.fileName,
      filePath: destPath,
      mimeType: input.mimeType,
      fileSize: stat.size,
      createdAt: now
    })
    .returning()

  const record = mapToRecord(result[0])

  // Audit log
  await logAudit({
    companyId,
    entityType: 'attachment',
    entityId: String(record.id),
    action: 'created',
    details: JSON.stringify({
      fileName: input.fileName,
      entityType: input.entityType,
      entityId: input.entityId,
      fileSize: stat.size
    })
  })

  return record
}

/**
 * Deletes an attachment record and removes the associated file from the filesystem.
 *
 * Validates:
 * - Attachment exists and belongs to the active company
 *
 * Records an audit log entry after successful deletion.
 */
export async function deleteAttachment(companyId: number, id: number): Promise<void> {
  const db = getDb()

  // Load attachment with company scoping
  const rows = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.companyId, companyId)))

  const existing = rows[0]

  if (!existing) {
    throw new NotFoundError('Attachment not found')
  }

  // Remove filesystem file (ignore if already gone)
  const absolutePath = join(getDataDir(), existing.filePath)
  try {
    await fs.unlink(absolutePath)
  } catch {
    // File already removed or inaccessible — proceed with DB deletion
  }

  // Delete DB record
  await db.delete(attachments).where(and(eq(attachments.id, id), eq(attachments.companyId, companyId)))

  // Audit log
  await logAudit({
    companyId,
    entityType: 'attachment',
    entityId: String(id),
    action: 'deleted',
    details: JSON.stringify({
      fileName: existing.fileName,
      entityType: existing.entityType,
      entityId: existing.entityId
    })
  })
}

/**
 * Computes the relative storage path for an attachment file.
 *
 * Path structure: `{companyId}/attachments/{entityType}/{entityId}/{fileName}`
 */
export function getFilePath(companyId: number, entityType: string, entityId: string, fileName: string): string {
  return join(String(companyId), 'attachments', entityType, entityId, fileName)
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Returns the base data directory for file storage.
 * Uses Electron's userData path.
 */
function getDataDir(): string {
  return app.getPath('userData')
}

/**
 * Maps a raw database row to the AttachmentRecord response type.
 */
function mapToRecord(row: typeof attachments.$inferSelect): AttachmentRecord {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    fileName: row.fileName,
    filePath: row.filePath,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    createdAt: row.createdAt
  }
}
