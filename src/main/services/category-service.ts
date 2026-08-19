/**
 * CategoryService — CRUD operations for product categories.
 *
 * All operations are company-scoped. Enforces:
 * - Unique category name per company
 * - Parent category validation (exists and belongs to same company)
 * - Referential integrity on deletion (rejects if products reference the category)
 */

import { and, eq } from 'drizzle-orm'

import { ConflictError, EntityReferencedError, NotFoundError, ValidationError } from '../api/errors'
import { categories, products } from '../db/schema'
import { getDb } from '../server'
import type { Category, CreateCategoryInput, UpdateCategoryInput } from './types'

/**
 * Returns all categories for the given company.
 */
export async function list(companyId: number): Promise<Category[]> {
  const db = getDb()

  const rows = await db.select().from(categories).where(eq(categories.companyId, companyId))

  return rows as Category[]
}

/**
 * Creates a new category for the given company.
 *
 * Validates:
 * - Name is not empty
 * - Parent category (if provided) exists and belongs to the same company
 * - Name is unique within the company (catches UNIQUE constraint violation)
 */
export async function create(companyId: number, input: CreateCategoryInput): Promise<Category> {
  const db = getDb()

  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError('Category name is required', { name: 'Name is required' })
  }

  if (input.parentCategoryId != null) {
    await validateParentCategory(companyId, input.parentCategoryId)
  }

  const now = new Date().toISOString()

  try {
    const result = await db
      .insert(categories)
      .values({
        companyId,
        name: input.name.trim(),
        parentCategoryId: input.parentCategoryId ?? null,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      .returning()

    return (result as Category[])[0]
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A category with name "${input.name.trim()}" already exists`)
    }
    throw error
  }
}

/**
 * Updates an existing category.
 *
 * Validates:
 * - Category exists and belongs to the company
 * - Parent category (if changed) exists and belongs to the same company
 * - Updated name is unique within the company
 */
export async function update(companyId: number, id: number, input: UpdateCategoryInput): Promise<Category> {
  const db = getDb()

  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.companyId, companyId)))

  const existing = (rows as Category[])[0]

  if (!existing) {
    throw new NotFoundError('Category not found')
  }

  if (input.parentCategoryId !== undefined && input.parentCategoryId !== existing.parentCategoryId) {
    if (input.parentCategoryId != null) {
      await validateParentCategory(companyId, input.parentCategoryId)
    }
  }

  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError('Category name cannot be empty', { name: 'Name cannot be empty' })
  }

  const now = new Date().toISOString()

  try {
    const result = await db
      .update(categories)
      .set({
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.parentCategoryId !== undefined && {
          parentCategoryId: input.parentCategoryId
        }),
        ...(input.status !== undefined && { status: input.status }),
        updatedAt: now
      })
      .where(and(eq(categories.id, id), eq(categories.companyId, companyId)))
      .returning()

    return (result as Category[])[0]
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A category with name "${input.name?.trim() ?? existing.name}" already exists`)
    }
    throw error
  }
}

/**
 * Deletes a category if it is not referenced by any products.
 *
 * Validates:
 * - Category exists and belongs to the company
 * - No products reference this category
 */
export async function deleteCategory(companyId: number, id: number): Promise<void> {
  const db = getDb()

  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.companyId, companyId)))

  const existing = (rows as Category[])[0]

  if (!existing) {
    throw new NotFoundError('Category not found')
  }

  const referencingProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.categoryId, id), eq(products.companyId, companyId)))
    .limit(1)

  if (referencingProducts.length > 0) {
    throw new EntityReferencedError('Cannot delete category because it is referenced by products')
  }

  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.companyId, companyId)))
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Validates that a parent category exists and belongs to the same company.
 */
async function validateParentCategory(companyId: number, parentCategoryId: number): Promise<void> {
  const db = getDb()

  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, parentCategoryId), eq(categories.companyId, companyId)))

  if (rows.length === 0) {
    throw new ValidationError('Parent category not found', {
      parentCategoryId: 'Parent category does not exist or belongs to another company'
    })
  }
}

/**
 * Checks if an error is a SQLite UNIQUE constraint violation.
 */
function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('UNIQUE constraint failed')
  }
  return false
}
