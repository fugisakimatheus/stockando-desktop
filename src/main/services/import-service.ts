/**
 * ImportService — Two-phase CSV import for bulk entity data.
 *
 * Phase 1 (validate): Parse CSV, validate rows against entity schema,
 * detect natural keys for insert/update determination, return row-level results.
 *
 * Phase 2 (confirm): Transactional commit of validated rows, with optional
 * partial import (skipInvalid=true skips invalid rows). Logs import_job entry
 * and audit trail on success.
 *
 * Enforces:
 * - File size limit (10MB)
 * - Company scoping on all inserts/updates
 * - Entity-specific required field validation
 * - Natural key detection for insert vs update
 * - Transactional consistency (rollback on failure)
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 16.5, 17.1, 17.2, 17.3, 17.4, 17.5
 */

import crypto from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { match } from 'ts-pattern'

import { BusinessRuleError, NotFoundError, ValidationError } from '../api/errors'
import { categories, customers, importJobs, products, suppliers } from '../db/schema'
import { getDb } from '../server'
import type {
  ConfirmImportInput,
  ImportableEntityType,
  ImportCommitResult,
  ImportDelimiter,
  ImportRowError,
  ImportRowValidation,
  ImportValidationResult,
  ValidateImportInput
} from '../types/phase4-types'
import { logAudit } from './audit-service'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum file size in bytes (10MB). */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/** Validation cache TTL in milliseconds (15 minutes). */
const VALIDATION_CACHE_TTL = 15 * 60 * 1000

// ---------------------------------------------------------------------------
// Validation Cache
// ---------------------------------------------------------------------------

interface ValidatedImportData {
  companyId: number
  entityType: ImportableEntityType
  rows: ImportRowValidation[]
  createdAt: number
}

const validationCache = new Map<string, ValidatedImportData>()

/**
 * Clears the validation cache. Exported for testing.
 */
export function clearValidationCache(): void {
  validationCache.clear()
}

// ---------------------------------------------------------------------------
// Entity Schemas (required fields per entity type)
// ---------------------------------------------------------------------------

interface FieldSchema {
  name: string
  required: boolean
  type: 'string' | 'number' | 'boolean'
}

const ENTITY_SCHEMAS: Record<ImportableEntityType, FieldSchema[]> = {
  products: [
    { name: 'sku', required: true, type: 'string' },
    { name: 'name', required: true, type: 'string' },
    { name: 'costPrice', required: false, type: 'number' },
    { name: 'salePrice', required: false, type: 'number' },
    { name: 'barcode', required: false, type: 'string' },
    { name: 'categoryName', required: false, type: 'string' }
  ],
  customers: [
    { name: 'name', required: true, type: 'string' },
    { name: 'documentNumber', required: false, type: 'string' },
    { name: 'email', required: false, type: 'string' },
    { name: 'phone', required: false, type: 'string' },
    { name: 'customerType', required: false, type: 'string' }
  ],
  suppliers: [
    { name: 'name', required: true, type: 'string' },
    { name: 'documentNumber', required: true, type: 'string' },
    { name: 'email', required: false, type: 'string' },
    { name: 'phone', required: false, type: 'string' }
  ],
  categories: [
    { name: 'name', required: true, type: 'string' },
    { name: 'parentCategoryName', required: false, type: 'string' }
  ]
}

/**
 * Returns the natural key field(s) for an entity type.
 * Used to determine if a row should INSERT or UPDATE.
 */
function getNaturalKeyField(entityType: ImportableEntityType): string {
  return match(entityType)
    .with('products', () => 'sku')
    .with('customers', () => 'documentNumber')
    .with('suppliers', () => 'documentNumber')
    .with('categories', () => 'name')
    .exhaustive()
}

// ---------------------------------------------------------------------------
// CSV Parser
// ---------------------------------------------------------------------------

/**
 * Parses a CSV buffer into an array of records using the specified delimiter.
 *
 * Handles:
 * - Quoted fields (fields containing delimiter or newlines inside quotes)
 * - First row as header
 * - Skips empty rows
 */
function parseCsv(buffer: Buffer, delimiter: ImportDelimiter): { headers: string[]; rows: Record<string, string>[] } {
  const content = buffer.toString('utf-8')
  const lines = splitCsvLines(content)

  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = parseCsvRow(lines[0], delimiter).map((h) => h.trim())
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue

    const fields = parseCsvRow(line, delimiter)
    const record: Record<string, string> = {}

    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = (fields[j] ?? '').trim()
    }

    rows.push(record)
  }

  return { headers, rows }
}

/**
 * Splits CSV content into logical lines, handling quoted fields that contain newlines.
 */
function splitCsvLines(content: string): string[] {
  const lines: string[] = []
  let current = ''
  let insideQuotes = false

  for (let i = 0; i < content.length; i++) {
    const char = content[i]

    if (char === '"') {
      insideQuotes = !insideQuotes
      current += char
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && content[i + 1] === '\n') {
        i++ // Skip \r\n pair
      }
      if (current.trim() !== '') {
        lines.push(current)
      }
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim() !== '') {
    lines.push(current)
  }

  return lines
}

/**
 * Parses a single CSV row into fields, handling quoted values.
 */
function parseCsvRow(row: string, delimiter: ImportDelimiter): string[] {
  const fields: string[] = []
  let current = ''
  let insideQuotes = false

  for (let i = 0; i < row.length; i++) {
    const char = row[i]

    if (char === '"') {
      if (insideQuotes && row[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"'
        i++
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (char === delimiter && !insideQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }

  fields.push(current)
  return fields
}

// ---------------------------------------------------------------------------
// Validation Logic
// ---------------------------------------------------------------------------

/**
 * Validates a parsed row against the entity schema.
 * Returns an array of errors (empty if valid).
 */
function validateRow(entityType: ImportableEntityType, data: Record<string, string>): ImportRowError[] {
  const schema = ENTITY_SCHEMAS[entityType]
  const errors: ImportRowError[] = []

  for (const field of schema) {
    const value = data[field.name]

    // Check required fields
    if (field.required && (!value || value.trim() === '')) {
      errors.push({
        column: field.name,
        message: `Field "${field.name}" is required`
      })
      continue
    }

    // Skip type validation for empty optional fields
    if (!value || value.trim() === '') continue

    // Validate type
    if (field.type === 'number') {
      const parsed = Number(value)
      if (Number.isNaN(parsed)) {
        errors.push({
          column: field.name,
          message: `Field "${field.name}" must be a valid number`
        })
      }
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Natural Key Lookup
// ---------------------------------------------------------------------------

/**
 * Checks if a natural key already exists in the database for the given entity type and company.
 * Returns the existing record ID if found, or null if it's a new record.
 */
async function findExistingByNaturalKey(
  companyId: number,
  entityType: ImportableEntityType,
  naturalKeyValue: string
): Promise<number | null> {
  if (!naturalKeyValue || naturalKeyValue.trim() === '') return null

  const db = getDb()

  const result = await match(entityType)
    .with('products', async () => {
      const [row] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.companyId, companyId), eq(products.sku, naturalKeyValue)))
      return row?.id ?? null
    })
    .with('customers', async () => {
      const [row] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.companyId, companyId), eq(customers.documentNumber, naturalKeyValue)))
      return row?.id ?? null
    })
    .with('suppliers', async () => {
      const [row] = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.companyId, companyId), eq(suppliers.documentNumber, naturalKeyValue)))
      return row?.id ?? null
    })
    .with('categories', async () => {
      const [row] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.companyId, companyId), eq(categories.name, naturalKeyValue)))
      return row?.id ?? null
    })
    .exhaustive()

  return result
}

// ---------------------------------------------------------------------------
// Public API — Validate
// ---------------------------------------------------------------------------

/**
 * Validates a CSV file for import.
 *
 * Parses the file, validates each row against the entity schema,
 * detects natural keys for insert/update determination, and returns
 * a validation result with row-level statuses.
 *
 * The validated data is stored in memory keyed by a UUID for use in the confirm step.
 *
 * @throws ValidationError if the file exceeds the size limit or has no data rows
 */
export async function validate(companyId: number, input: ValidateImportInput): Promise<ImportValidationResult> {
  // Enforce file size limit
  if (input.fileBuffer.length > MAX_FILE_SIZE) {
    throw new ValidationError(`File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`)
  }

  // Parse CSV
  const { headers, rows: parsedRows } = parseCsv(input.fileBuffer, input.delimiter)

  if (headers.length === 0 || parsedRows.length === 0) {
    throw new ValidationError('CSV file contains no data rows')
  }

  // Validate each row
  const naturalKeyField = getNaturalKeyField(input.entityType)
  const rowValidations: ImportRowValidation[] = []
  let validCount = 0
  let invalidCount = 0
  let creates = 0
  let updates = 0

  for (let i = 0; i < parsedRows.length; i++) {
    const data = parsedRows[i]
    const errors = validateRow(input.entityType, data)

    if (errors.length > 0) {
      rowValidations.push({
        rowNumber: i + 2, // +2: 1-indexed + header row
        status: 'invalid',
        data,
        errors
      })
      invalidCount++
    } else {
      // Check natural key for insert vs update
      const naturalKeyValue = data[naturalKeyField] ?? ''
      const existingId = await findExistingByNaturalKey(companyId, input.entityType, naturalKeyValue)

      if (existingId !== null) {
        updates++
      } else {
        creates++
      }

      rowValidations.push({
        rowNumber: i + 2,
        status: 'valid',
        data,
        errors: []
      })
      validCount++
    }
  }

  // Generate validation ID and store in cache
  const validationId = crypto.randomUUID()

  validationCache.set(validationId, {
    companyId,
    entityType: input.entityType,
    rows: rowValidations,
    createdAt: Date.now()
  })

  // Schedule cache cleanup
  setTimeout(() => {
    validationCache.delete(validationId)
  }, VALIDATION_CACHE_TTL)

  return {
    validationId,
    entityType: input.entityType,
    totalRows: parsedRows.length,
    validRows: validCount,
    invalidRows: invalidCount,
    rows: rowValidations,
    expectedChanges: {
      creates,
      updates
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — Confirm
// ---------------------------------------------------------------------------

/**
 * Commits a previously validated import.
 *
 * Executes all inserts/updates within a single transaction.
 * If skipInvalid=false and there are invalid rows, throws an error.
 * If skipInvalid=true, only valid rows are committed.
 *
 * Logs an import_job entry and audit trail on success.
 *
 * @throws NotFoundError if the validationId is not found in cache
 * @throws BusinessRuleError if skipInvalid=false and there are invalid rows
 */
export async function confirm(companyId: number, input: ConfirmImportInput): Promise<ImportCommitResult> {
  const cached = validationCache.get(input.validationId)

  if (!cached) {
    throw new NotFoundError('Validation result not found or expired. Please validate the file again.')
  }

  // Verify company scope matches
  if (cached.companyId !== companyId) {
    throw new NotFoundError('Validation result not found or expired. Please validate the file again.')
  }

  const allRows = cached.rows
  const validRows = allRows.filter((r) => r.status === 'valid')
  const invalidRows = allRows.filter((r) => r.status === 'invalid')

  // If skipInvalid=false and there are invalid rows, reject
  if (!input.skipInvalid && invalidRows.length > 0) {
    throw new BusinessRuleError(
      `Import contains ${invalidRows.length} invalid row(s). Fix them or enable "skip invalid rows" to proceed.`
    )
  }

  const rowsToCommit = validRows
  const db = getDb()
  const now = new Date().toISOString()

  let createdRecords = 0
  let updatedRecords = 0

  try {
    await db.transaction(async (tx) => {
      for (const row of rowsToCommit) {
        const result = await commitRow(tx, companyId, cached.entityType, row.data, now)
        if (result === 'created') {
          createdRecords++
        } else {
          updatedRecords++
        }
      }

      // Log import job
      await tx.insert(importJobs).values({
        companyId,
        entityType: cached.entityType,
        fileName: `import_${cached.entityType}_${now}.csv`,
        status: 'completed',
        totalRows: allRows.length,
        importedRows: rowsToCommit.length,
        skippedRows: invalidRows.length,
        failedRows: 0,
        createdAt: now
      })
    })
  } catch (error) {
    // Log failed import job
    await db.insert(importJobs).values({
      companyId,
      entityType: cached.entityType,
      fileName: `import_${cached.entityType}_${now}.csv`,
      status: 'failed',
      totalRows: allRows.length,
      importedRows: 0,
      skippedRows: 0,
      failedRows: rowsToCommit.length,
      errorDetails: error instanceof Error ? error.message : 'Unknown error',
      createdAt: now
    })

    // Clear cache and re-throw
    validationCache.delete(input.validationId)
    throw error
  }

  // Audit log
  await logAudit({
    companyId,
    entityType: 'import',
    entityId: input.validationId,
    action: 'completed',
    details: JSON.stringify({
      entityType: cached.entityType,
      totalRows: allRows.length,
      importedRows: rowsToCommit.length,
      createdRecords,
      updatedRecords,
      skippedRows: invalidRows.length
    })
  })

  // Clear cache entry
  validationCache.delete(input.validationId)

  return {
    entityType: cached.entityType,
    totalRows: allRows.length,
    importedRows: rowsToCommit.length,
    skippedRows: invalidRows.length,
    failedRows: 0,
    createdRecords,
    updatedRecords
  }
}

// ---------------------------------------------------------------------------
// Row Commit Logic
// ---------------------------------------------------------------------------

type DrizzleTx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

/**
 * Commits a single row to the database (INSERT or UPDATE based on natural key).
 * Returns 'created' or 'updated' to track the operation type.
 */
async function commitRow(
  tx: DrizzleTx,
  companyId: number,
  entityType: ImportableEntityType,
  data: Record<string, string>,
  now: string
): Promise<'created' | 'updated'> {
  return match(entityType)
    .with('products', () => commitProduct(tx, companyId, data, now))
    .with('customers', () => commitCustomer(tx, companyId, data, now))
    .with('suppliers', () => commitSupplier(tx, companyId, data, now))
    .with('categories', () => commitCategory(tx, companyId, data, now))
    .exhaustive()
}

// ---------------------------------------------------------------------------
// Entity-specific commit functions
// ---------------------------------------------------------------------------

async function commitProduct(
  tx: DrizzleTx,
  companyId: number,
  data: Record<string, string>,
  now: string
): Promise<'created' | 'updated'> {
  const sku = (data['sku'] ?? '').trim()
  const name = (data['name'] ?? '').trim()
  const costPrice = data['costPrice'] ? Number(data['costPrice']) : null
  const salePrice = data['salePrice'] ? Number(data['salePrice']) : null
  const barcode = data['barcode']?.trim() || null

  // Resolve category by name if provided
  let categoryId: number | null = null
  if (data['categoryName']?.trim()) {
    const [cat] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.companyId, companyId), eq(categories.name, data['categoryName'].trim())))
    categoryId = cat?.id ?? null
  }

  // Check if product with this SKU exists
  const [existing] = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.companyId, companyId), eq(products.sku, sku)))

  if (existing) {
    await tx
      .update(products)
      .set({
        name,
        costPrice,
        salePrice,
        barcode,
        categoryId,
        updatedAt: now
      })
      .where(eq(products.id, existing.id))
    return 'updated'
  }

  await tx.insert(products).values({
    companyId,
    sku,
    name,
    costPrice,
    salePrice,
    barcode,
    categoryId,
    trackInventory: false,
    status: 'active',
    createdAt: now,
    updatedAt: now
  })
  return 'created'
}

async function commitCustomer(
  tx: DrizzleTx,
  companyId: number,
  data: Record<string, string>,
  now: string
): Promise<'created' | 'updated'> {
  const name = (data['name'] ?? '').trim()
  const documentNumber = data['documentNumber']?.trim() || null
  const email = data['email']?.trim() || null
  const phone = data['phone']?.trim() || null
  const customerType = data['customerType']?.trim() || 'individual'

  // Check if customer with this document number exists (only if documentNumber is provided)
  if (documentNumber) {
    const [existing] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.companyId, companyId), eq(customers.documentNumber, documentNumber)))

    if (existing) {
      await tx
        .update(customers)
        .set({
          name,
          email,
          phone,
          customerType,
          updatedAt: now
        })
        .where(eq(customers.id, existing.id))
      return 'updated'
    }
  }

  await tx.insert(customers).values({
    companyId,
    name,
    documentNumber,
    email,
    phone,
    customerType,
    status: 'active',
    createdAt: now,
    updatedAt: now
  })
  return 'created'
}

async function commitSupplier(
  tx: DrizzleTx,
  companyId: number,
  data: Record<string, string>,
  now: string
): Promise<'created' | 'updated'> {
  const name = (data['name'] ?? '').trim()
  const documentNumber = (data['documentNumber'] ?? '').trim()
  const email = data['email']?.trim() || null
  const phone = data['phone']?.trim() || null

  // Check if supplier with this document number exists
  const [existing] = await tx
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.companyId, companyId), eq(suppliers.documentNumber, documentNumber)))

  if (existing) {
    await tx
      .update(suppliers)
      .set({
        name,
        email,
        phone,
        updatedAt: now
      })
      .where(eq(suppliers.id, existing.id))
    return 'updated'
  }

  await tx.insert(suppliers).values({
    companyId,
    name,
    documentNumber,
    email,
    phone,
    status: 'active',
    createdAt: now,
    updatedAt: now
  })
  return 'created'
}

async function commitCategory(
  tx: DrizzleTx,
  companyId: number,
  data: Record<string, string>,
  now: string
): Promise<'created' | 'updated'> {
  const name = (data['name'] ?? '').trim()

  // Resolve parent category by name if provided
  let parentCategoryId: number | null = null
  if (data['parentCategoryName']?.trim()) {
    const [parent] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.companyId, companyId), eq(categories.name, data['parentCategoryName'].trim())))
    parentCategoryId = parent?.id ?? null
  }

  // Check if category with this name exists
  const [existing] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.companyId, companyId), eq(categories.name, name)))

  if (existing) {
    await tx
      .update(categories)
      .set({
        parentCategoryId,
        updatedAt: now
      })
      .where(eq(categories.id, existing.id))
    return 'updated'
  }

  await tx.insert(categories).values({
    companyId,
    name,
    parentCategoryId,
    status: 'active',
    createdAt: now,
    updatedAt: now
  })
  return 'created'
}
