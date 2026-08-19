/**
 * WarehouseService — CRUD operations for warehouse management.
 *
 * All operations enforce company scoping. Duplicate warehouse codes within
 * the same company are rejected with a ConflictError. Deletion is blocked
 * when the warehouse holds stock records with non-zero quantities.
 */

import { and, eq, ne } from 'drizzle-orm'

import { ConflictError, EntityReferencedError, NotFoundError } from '../api/errors'
import { stock, warehouses } from '../db/schema'
import { getDb } from '../server'
import type { CreateWarehouseInput, UpdateWarehouseInput, Warehouse } from './types'

/**
 * Lists all warehouses belonging to the given company.
 */
export async function list(companyId: number): Promise<Warehouse[]> {
  const db = getDb()

  return db.select().from(warehouses).where(eq(warehouses.companyId, companyId))
}

/**
 * Creates a new warehouse scoped to the given company.
 *
 * Throws ConflictError if a warehouse with the same code already exists
 * for the company.
 */
export async function create(companyId: number, input: CreateWarehouseInput): Promise<Warehouse> {
  const db = getDb()
  const now = new Date().toISOString()

  try {
    const [created] = await db
      .insert(warehouses)
      .values({
        companyId,
        name: input.name,
        code: input.code,
        address: input.address ?? null,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      .returning()

    return created
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new ConflictError(`Warehouse with code "${input.code}" already exists for this company`)
    }
    throw error
  }
}

/**
 * Updates an existing warehouse. Only provided fields are modified.
 *
 * Throws NotFoundError if the warehouse does not exist or does not belong
 * to the given company.
 */
export async function update(companyId: number, id: number, input: UpdateWarehouseInput): Promise<Warehouse> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.id, id), eq(warehouses.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError(`Warehouse with id ${id} not found`)
  }

  const now = new Date().toISOString()

  const [updated] = await db
    .update(warehouses)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.status !== undefined && { status: input.status }),
      updatedAt: now
    })
    .where(and(eq(warehouses.id, id), eq(warehouses.companyId, companyId)))
    .returning()

  return updated
}

/**
 * Deletes a warehouse by id within the given company scope.
 *
 * Throws NotFoundError if the warehouse does not exist.
 * Throws EntityReferencedError if stock records with non-zero quantities
 * exist for this warehouse.
 */
export async function deleteWarehouse(companyId: number, id: number): Promise<void> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.id, id), eq(warehouses.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError(`Warehouse with id ${id} not found`)
  }

  // Check for stock records with non-zero quantities
  const nonZeroStock = await db
    .select()
    .from(stock)
    .where(and(eq(stock.warehouseId, id), ne(stock.quantity, 0)))
    .limit(1)

  if (nonZeroStock.length > 0) {
    throw new EntityReferencedError('Cannot delete warehouse because it has stock records with non-zero quantities')
  }

  await db.delete(warehouses).where(and(eq(warehouses.id, id), eq(warehouses.companyId, companyId)))
}
