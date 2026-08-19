/**
 * UnitOfMeasureService — CRUD operations for units of measure.
 *
 * All operations are company-scoped. Enforces unique name constraint per company
 * and prevents deletion when the unit is referenced by products.
 */

import { and, eq } from 'drizzle-orm'

import { ConflictError, EntityReferencedError, NotFoundError } from '../api/errors'
import { products, unitsOfMeasure } from '../db/schema'
import { getDb } from '../server'
import type { CreateUnitInput, UnitOfMeasure, UpdateUnitInput } from './types'

/**
 * Returns all units of measure for the given company.
 */
export async function list(companyId: number): Promise<UnitOfMeasure[]> {
  const db = getDb()

  return db.select().from(unitsOfMeasure).where(eq(unitsOfMeasure.companyId, companyId))
}

/**
 * Creates a new unit of measure scoped to the given company.
 *
 * Throws ConflictError if a unit with the same name already exists for the company.
 */
export async function create(companyId: number, input: CreateUnitInput): Promise<UnitOfMeasure> {
  const db = getDb()
  const now = new Date().toISOString()

  try {
    const [unit] = await db
      .insert(unitsOfMeasure)
      .values({
        companyId,
        name: input.name,
        symbol: input.symbol,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      .returning()

    return unit
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new ConflictError(`Unit of measure with name "${input.name}" already exists`)
    }
    throw error
  }
}

/**
 * Updates an existing unit of measure.
 *
 * Throws NotFoundError if the unit does not exist or does not belong to the company.
 * Throws ConflictError if the new name would collide with an existing unit in the same company.
 */
export async function update(companyId: number, id: number, input: UpdateUnitInput): Promise<UnitOfMeasure> {
  const db = getDb()
  const now = new Date().toISOString()

  const [existing] = await db
    .select()
    .from(unitsOfMeasure)
    .where(and(eq(unitsOfMeasure.id, id), eq(unitsOfMeasure.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError(`Unit of measure not found`)
  }

  try {
    const [updated] = await db
      .update(unitsOfMeasure)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.symbol !== undefined && { symbol: input.symbol }),
        ...(input.status !== undefined && { status: input.status }),
        updatedAt: now
      })
      .where(and(eq(unitsOfMeasure.id, id), eq(unitsOfMeasure.companyId, companyId)))
      .returning()

    return updated
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new ConflictError(`Unit of measure with name "${input.name}" already exists`)
    }
    throw error
  }
}

/**
 * Deletes a unit of measure.
 *
 * Throws NotFoundError if the unit does not exist or does not belong to the company.
 * Throws EntityReferencedError if any products reference this unit.
 */
export async function deleteUnit(companyId: number, id: number): Promise<void> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(unitsOfMeasure)
    .where(and(eq(unitsOfMeasure.id, id), eq(unitsOfMeasure.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError(`Unit of measure not found`)
  }

  // Check if any products reference this unit
  const [referencingProduct] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.unitId, id))
    .limit(1)

  if (referencingProduct) {
    throw new EntityReferencedError('Cannot delete unit of measure because it is referenced by products')
  }

  await db.delete(unitsOfMeasure).where(and(eq(unitsOfMeasure.id, id), eq(unitsOfMeasure.companyId, companyId)))
}
