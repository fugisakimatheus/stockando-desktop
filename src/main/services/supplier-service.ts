/**
 * SupplierService — CRUD operations for suppliers.
 *
 * All operations are company-scoped. Enforces:
 * - Unique documentNumber per company
 * - Paginated list with search by name/documentNumber and status filter
 * - Referential integrity on deletion (rejects if purchase orders exist)
 */

import { and, count, eq, like, or } from 'drizzle-orm'

import { ConflictError, EntityReferencedError, NotFoundError, ValidationError } from '../api/errors'
import { purchaseOrders, suppliers } from '../db/schema'
import { getDb } from '../server'
import type {
  CreateSupplierInput,
  PaginatedResult,
  Supplier,
  SupplierDetail,
  SupplierListFilters,
  SupplierListItem,
  UpdateSupplierInput
} from './types'

/**
 * Returns a paginated list of suppliers for the given company with optional filtering.
 *
 * Supports:
 * - search term matching name or documentNumber (case-insensitive LIKE)
 * - status filter (active/inactive)
 * - limit/offset pagination with total count
 */
export async function list(
  companyId: number,
  filters: SupplierListFilters
): Promise<PaginatedResult<SupplierListItem>> {
  const db = getDb()

  const limit = filters.limit || 20
  const offset = filters.offset || 0

  const conditions = [eq(suppliers.companyId, companyId)]

  if (filters.status !== undefined) {
    conditions.push(eq(suppliers.status, filters.status))
  }

  if (filters.search) {
    const searchPattern = `%${filters.search}%`
    const searchCondition = or(like(suppliers.name, searchPattern), like(suppliers.documentNumber, searchPattern))
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereClause = and(...conditions)

  const [countResult] = await db.select({ total: count() }).from(suppliers).where(whereClause)

  const total = countResult?.total ?? 0

  const rows = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      documentNumber: suppliers.documentNumber,
      tradeName: suppliers.tradeName,
      email: suppliers.email,
      status: suppliers.status
    })
    .from(suppliers)
    .where(whereClause)
    .limit(limit)
    .offset(offset)

  const data: SupplierListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    documentNumber: row.documentNumber,
    tradeName: row.tradeName ?? null,
    email: row.email ?? null,
    status: row.status
  }))

  return { data, total, limit, offset }
}

/**
 * Returns full supplier details with purchase order count.
 *
 * Throws NotFoundError if the supplier does not exist or does not belong to the company.
 */
export async function detail(companyId: number, id: number): Promise<SupplierDetail> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Supplier not found')
  }

  const [poCount] = await db
    .select({ total: count() })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.supplierId, id), eq(purchaseOrders.companyId, companyId)))

  return {
    id: existing.id,
    companyId: existing.companyId,
    name: existing.name,
    documentNumber: existing.documentNumber,
    tradeName: existing.tradeName ?? null,
    email: existing.email ?? null,
    phone: existing.phone ?? null,
    address: existing.address ?? null,
    status: existing.status,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
    purchaseOrderCount: poCount?.total ?? 0
  }
}

/**
 * Creates a new supplier for the given company.
 *
 * Validates:
 * - Name is not empty
 * - DocumentNumber is not empty
 * - DocumentNumber is unique within the company (catches UNIQUE constraint violation)
 */
export async function create(companyId: number, input: CreateSupplierInput): Promise<Supplier> {
  const db = getDb()

  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError('Supplier name is required', { name: 'Name is required' })
  }

  if (!input.documentNumber || input.documentNumber.trim().length === 0) {
    throw new ValidationError('Supplier document number is required', {
      documentNumber: 'Document number is required'
    })
  }

  const now = new Date().toISOString()

  try {
    const [supplier] = await db
      .insert(suppliers)
      .values({
        companyId,
        name: input.name.trim(),
        documentNumber: input.documentNumber.trim(),
        tradeName: input.tradeName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      .returning()

    return supplier
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A supplier with document number "${input.documentNumber.trim()}" already exists`)
    }
    throw error
  }
}

/**
 * Updates an existing supplier.
 *
 * Validates:
 * - Supplier exists and belongs to the company
 * - Name (if provided) is not empty
 *
 * Throws NotFoundError if the supplier does not exist or does not belong to the company.
 */
export async function update(companyId: number, id: number, input: UpdateSupplierInput): Promise<Supplier> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Supplier not found')
  }

  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError('Supplier name cannot be empty', { name: 'Name cannot be empty' })
  }

  const now = new Date().toISOString()

  const [updated] = await db
    .update(suppliers)
    .set({
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.tradeName !== undefined && { tradeName: input.tradeName }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.status !== undefined && { status: input.status }),
      updatedAt: now
    })
    .where(and(eq(suppliers.id, id), eq(suppliers.companyId, companyId)))
    .returning()

  return updated
}

/**
 * Deletes a supplier if it is not referenced by any purchase orders.
 *
 * Validates:
 * - Supplier exists and belongs to the company
 * - No purchase orders reference this supplier
 *
 * Throws NotFoundError if the supplier does not exist.
 * Throws EntityReferencedError if the supplier is referenced by purchase orders.
 */
export async function deleteSupplier(companyId: number, id: number): Promise<void> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Supplier not found')
  }

  const [referencingPo] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.supplierId, id), eq(purchaseOrders.companyId, companyId)))
    .limit(1)

  if (referencingPo) {
    throw new EntityReferencedError('Cannot delete supplier because it is referenced by purchase orders')
  }

  await db.delete(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.companyId, companyId)))
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Checks if an error is a SQLite UNIQUE constraint violation.
 */
function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('UNIQUE constraint failed')
  }
  return false
}
