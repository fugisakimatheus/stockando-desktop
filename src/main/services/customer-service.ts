/**
 * CustomerService — CRUD operations for customers.
 *
 * All operations are company-scoped. Enforces:
 * - Unique documentNumber per company
 * - Referential integrity on deletion (rejects if quotes/orders reference the customer)
 * - Paginated, searchable listing
 */

import { and, count, eq, like, or } from 'drizzle-orm'

import { ConflictError, EntityReferencedError, NotFoundError, ValidationError } from '../api/errors'
import { customers, orders, quotes } from '../db/schema'
import { getDb } from '../server'
import type {
  CreateCustomerInput,
  CustomerDetail,
  CustomerListFilters,
  CustomerListItem,
  PaginatedResult,
  UpdateCustomerInput
} from './types'

/**
 * Returns a paginated list of customers for the given company.
 * Supports search by name or documentNumber and status filtering.
 */
export async function list(
  companyId: number,
  filters: CustomerListFilters
): Promise<PaginatedResult<CustomerListItem>> {
  const db = getDb()

  const conditions = [eq(customers.companyId, companyId)]

  if (filters.status) {
    conditions.push(eq(customers.status, filters.status))
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`
    const searchCondition = or(like(customers.name, pattern), like(customers.documentNumber, pattern))
    if (searchCondition) conditions.push(searchCondition)
  }

  const where = and(...conditions)

  const [totalResult, rows] = await Promise.all([
    db.select({ total: count() }).from(customers).where(where),
    db
      .select({
        id: customers.id,
        name: customers.name,
        documentNumber: customers.documentNumber,
        email: customers.email,
        phone: customers.phone,
        status: customers.status
      })
      .from(customers)
      .where(where)
      .limit(filters.limit)
      .offset(filters.offset)
  ])

  return {
    data: rows as CustomerListItem[],
    total: totalResult[0]?.total ?? 0,
    limit: filters.limit,
    offset: filters.offset
  }
}

/**
 * Returns a single customer with quote and sales order counts.
 */
export async function detail(companyId: number, id: number): Promise<CustomerDetail> {
  const db = getDb()

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))

  const customer = rows[0]

  if (!customer) {
    throw new NotFoundError('Customer not found')
  }

  const [quoteCountResult, orderCountResult] = await Promise.all([
    db
      .select({ total: count() })
      .from(quotes)
      .where(and(eq(quotes.customerId, id), eq(quotes.companyId, companyId))),
    db
      .select({ total: count() })
      .from(orders)
      .where(and(eq(orders.customerId, id), eq(orders.companyId, companyId)))
  ])

  return {
    ...customer,
    quoteCount: quoteCountResult[0]?.total ?? 0,
    salesOrderCount: orderCountResult[0]?.total ?? 0
  }
}

/**
 * Creates a new customer for the given company.
 *
 * Validates:
 * - Name is not empty
 * - documentNumber uniqueness within the company (catches UNIQUE constraint violation)
 */
export async function create(companyId: number, input: CreateCustomerInput): Promise<CustomerDetail> {
  const db = getDb()

  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError('Customer name is required', { name: 'Name is required' })
  }

  const now = new Date().toISOString()

  try {
    const result = await db
      .insert(customers)
      .values({
        companyId,
        name: input.name.trim(),
        documentNumber: input.documentNumber ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        customerType: input.customerType ?? 'individual',
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      .returning()

    const created = result[0]

    return {
      ...created,
      quoteCount: 0,
      salesOrderCount: 0
    }
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A customer with document number "${input.documentNumber}" already exists`)
    }
    throw error
  }
}

/**
 * Updates an existing customer.
 *
 * Validates:
 * - Customer exists and belongs to the company
 * - Updated documentNumber is unique within the company
 */
export async function update(companyId: number, id: number, input: UpdateCustomerInput): Promise<CustomerDetail> {
  const db = getDb()

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))

  const existing = rows[0]

  if (!existing) {
    throw new NotFoundError('Customer not found')
  }

  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError('Customer name cannot be empty', { name: 'Name cannot be empty' })
  }

  const now = new Date().toISOString()

  try {
    const result = await db
      .update(customers)
      .set({
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.documentNumber !== undefined && { documentNumber: input.documentNumber }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.status !== undefined && { status: input.status }),
        updatedAt: now
      })
      .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))
      .returning()

    const updated = result[0]

    // Fetch counts for detail response
    const [quoteCountResult, orderCountResult] = await Promise.all([
      db
        .select({ total: count() })
        .from(quotes)
        .where(and(eq(quotes.customerId, id), eq(quotes.companyId, companyId))),
      db
        .select({ total: count() })
        .from(orders)
        .where(and(eq(orders.customerId, id), eq(orders.companyId, companyId)))
    ])

    return {
      ...updated,
      quoteCount: quoteCountResult[0]?.total ?? 0,
      salesOrderCount: orderCountResult[0]?.total ?? 0
    }
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(
        `A customer with document number "${input.documentNumber ?? existing.documentNumber}" already exists`
      )
    }
    throw error
  }
}

/**
 * Deletes a customer if it is not referenced by any quotes or orders.
 *
 * Validates:
 * - Customer exists and belongs to the company
 * - No quotes or orders reference this customer
 */
export async function deleteCustomer(companyId: number, id: number): Promise<void> {
  const db = getDb()

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))

  const existing = rows[0]

  if (!existing) {
    throw new NotFoundError('Customer not found')
  }

  const [referencingQuotes, referencingOrders] = await Promise.all([
    db
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.customerId, id), eq(quotes.companyId, companyId)))
      .limit(1),
    db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.customerId, id), eq(orders.companyId, companyId)))
      .limit(1)
  ])

  if (referencingQuotes.length > 0 || referencingOrders.length > 0) {
    throw new EntityReferencedError('Cannot delete customer because it is referenced by quotes or orders')
  }

  await db.delete(customers).where(and(eq(customers.id, id), eq(customers.companyId, companyId)))
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
