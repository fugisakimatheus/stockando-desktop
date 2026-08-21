/**
 * Typed API client helpers for attachment endpoints.
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttachmentRecord {
  id: number
  entityType: string
  entityId: string
  fileName: string
  filePath: string
  mimeType: string | null
  fileSize: number | null
  createdAt: string
}

interface UploadAttachmentInput {
  fileName: string
  filePath: string
  mimeType: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

// ---------------------------------------------------------------------------
// Attachments API
// ---------------------------------------------------------------------------

function listAttachments(companyId: number, entityType: string, entityId: string): Promise<AttachmentRecord[]> {
  return apiClient<AttachmentRecord[]>(`/attachments/${entityType}/${entityId}`, {
    headers: companyHeaders(companyId)
  })
}

function uploadAttachment(
  companyId: number,
  entityType: string,
  entityId: string,
  input: UploadAttachmentInput
): Promise<AttachmentRecord> {
  return apiClient<AttachmentRecord>(`/attachments/${entityType}/${entityId}`, {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function deleteAttachment(companyId: number, id: number): Promise<void> {
  return apiClient<void>(`/attachments/${id}`, {
    method: 'DELETE',
    headers: companyHeaders(companyId)
  })
}

export { listAttachments, uploadAttachment, deleteAttachment }
export type { AttachmentRecord, UploadAttachmentInput }
