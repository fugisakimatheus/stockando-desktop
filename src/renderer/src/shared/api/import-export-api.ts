/**
 * Typed API client helpers for import/export endpoints.
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Import Types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

type ImportableEntityType = 'products' | 'customers' | 'suppliers' | 'categories'

type ImportDelimiter = ',' | ';'

interface ValidateImportInput {
  entityType: ImportableEntityType
  fileContent: string
  delimiter: ImportDelimiter
}

interface ImportRowError {
  column: string
  message: string
}

interface ImportRowValidation {
  rowNumber: number
  status: 'valid' | 'invalid'
  data: Record<string, string>
  errors: ImportRowError[]
}

interface ImportValidationResult {
  validationId: string
  entityType: ImportableEntityType
  totalRows: number
  validRows: number
  invalidRows: number
  rows: ImportRowValidation[]
  expectedChanges: {
    creates: number
    updates: number
  }
}

interface ConfirmImportInput {
  validationId: string
  skipInvalid: boolean
}

interface ImportCommitResult {
  entityType: ImportableEntityType
  totalRows: number
  importedRows: number
  skippedRows: number
  failedRows: number
  createdRecords: number
  updatedRecords: number
}

// ---------------------------------------------------------------------------
// Export Types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

type ExportableEntityType =
  | 'products'
  | 'customers'
  | 'suppliers'
  | 'categories'
  | 'sales_orders'
  | 'purchase_orders'
  | 'inventory_movements'

interface EntityExportFilters {
  startDate?: string
  endDate?: string
  status?: string
  categoryId?: number
}

interface ExportEntitiesInput {
  entityType: ExportableEntityType
  filters?: EntityExportFilters
}

interface EntityExportFileResult {
  filePath: string
  fileSize: number
  recordCount: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

// ---------------------------------------------------------------------------
// Import API
// ---------------------------------------------------------------------------

/**
 * Validates a CSV file for import. Sends the file content as a base64-encoded
 * string and returns a validation result with row-level statuses.
 */
function validateImport(companyId: number, input: ValidateImportInput): Promise<ImportValidationResult> {
  return apiClient<ImportValidationResult>('/imports/validate', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

/**
 * Confirms a previously validated import. Commits valid rows transactionally
 * and returns a summary of the operation.
 */
function confirmImport(companyId: number, input: ConfirmImportInput): Promise<ImportCommitResult> {
  return apiClient<ImportCommitResult>('/imports/confirm', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Export API
// ---------------------------------------------------------------------------

/**
 * Exports entity data to CSV. Returns the file path, file size, and record count.
 */
function exportEntities(companyId: number, input: ExportEntitiesInput): Promise<EntityExportFileResult> {
  return apiClient<EntityExportFileResult>('/exports/entities', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { validateImport, confirmImport, exportEntities }
export type {
  ImportableEntityType,
  ImportDelimiter,
  ValidateImportInput,
  ImportRowError,
  ImportRowValidation,
  ImportValidationResult,
  ConfirmImportInput,
  ImportCommitResult,
  ExportableEntityType,
  EntityExportFilters,
  ExportEntitiesInput,
  EntityExportFileResult
}
