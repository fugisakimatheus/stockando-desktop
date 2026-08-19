/**
 * ProductService — CRUD operations and paginated list for products.
 *
 * All operations are company-scoped. Enforces:
 * - Unique SKU per company
 * - Paginated list with category, status, and search filters
 * - Resolved category name and unit symbol on detail requests
 * - Deletion guard when trackInventory is true and stock movements exist
 */

import { and, count, eq, like, or } from 'drizzle-orm'

import { ConflictError, EntityReferencedError, NotFoundError, ValidationError } from '../api/errors'
import { categories, products, stockMovements, unitsOfMeasure } from '../db/schema'
import { getDb } from '../server'
import type {
  CreateProductInput,
  PaginatedResult,
  Product,
  ProductDetail,
  ProductListFilters,
  ProductListItem,
  UpdateProductInput
} from './types'

/**
 * Returns a paginated list of products for the given company with optional filtering.
 *
 * Supports:
 * - categoryId filter
 * - status filter (active/inactive)
 * - search term matching name or SKU (case-insensitive LIKE)
 * - limit/offset pagination with total count
 */
export async function list(companyId: number, filters: ProductListFilters): Promise<PaginatedResult<ProductListItem>> {
  const db = getDb()

  const limit = filters.limit || 20
  const offset = filters.offset || 0

  const conditions = [eq(products.companyId, companyId)]

  if (filters.categoryId !== undefined) {
    conditions.push(eq(products.categoryId, filters.categoryId))
  }

  if (filters.status !== undefined) {
    conditions.push(eq(products.status, filters.status))
  }

  if (filters.search) {
    const searchPattern = `%${filters.search}%`
    const searchCondition = or(like(products.name, searchPattern), like(products.sku, searchPattern))
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereClause = and(...conditions)

  // Count query for total
  const [countResult] = await db.select({ total: count() }).from(products).where(whereClause)

  const total = countResult?.total ?? 0

  // Data query with LEFT JOINs
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      categoryName: categories.name,
      unitSymbol: unitsOfMeasure.symbol,
      costPrice: products.costPrice,
      salePrice: products.salePrice,
      trackInventory: products.trackInventory,
      status: products.status
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(unitsOfMeasure, eq(products.unitId, unitsOfMeasure.id))
    .where(whereClause)
    .limit(limit)
    .offset(offset)

  const data: ProductListItem[] = rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryName: row.categoryName ?? null,
    unitSymbol: row.unitSymbol ?? null,
    costPrice: row.costPrice ?? null,
    salePrice: row.salePrice ?? null,
    trackInventory: row.trackInventory,
    status: row.status
  }))

  return { data, total, limit, offset }
}

/**
 * Returns full product details with resolved category and unit names.
 *
 * Throws NotFoundError if the product does not exist or does not belong to the company.
 */
export async function detail(companyId: number, id: number): Promise<ProductDetail> {
  const db = getDb()

  const rows = await db
    .select({
      id: products.id,
      companyId: products.companyId,
      categoryId: products.categoryId,
      unitId: products.unitId,
      sku: products.sku,
      name: products.name,
      description: products.description,
      barcode: products.barcode,
      costPrice: products.costPrice,
      salePrice: products.salePrice,
      trackInventory: products.trackInventory,
      status: products.status,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      categoryName: categories.name,
      unitName: unitsOfMeasure.name,
      unitSymbol: unitsOfMeasure.symbol
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(unitsOfMeasure, eq(products.unitId, unitsOfMeasure.id))
    .where(and(eq(products.id, id), eq(products.companyId, companyId)))

  const row = rows[0]

  if (!row) {
    throw new NotFoundError('Product not found')
  }

  return {
    id: row.id,
    companyId: row.companyId,
    categoryId: row.categoryId,
    unitId: row.unitId,
    sku: row.sku,
    name: row.name,
    description: row.description,
    barcode: row.barcode,
    costPrice: row.costPrice,
    salePrice: row.salePrice,
    trackInventory: row.trackInventory,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    categoryName: row.categoryName ?? null,
    unitName: row.unitName ?? null,
    unitSymbol: row.unitSymbol ?? null
  }
}

/**
 * Creates a new product for the given company.
 *
 * Defaults: trackInventory = false, status = 'active'.
 * Throws ConflictError if a product with the same SKU already exists for the company.
 * Throws ValidationError if SKU or name is empty.
 */
export async function create(companyId: number, input: CreateProductInput): Promise<Product> {
  const db = getDb()

  if (!input.sku || input.sku.trim().length === 0) {
    throw new ValidationError('Product SKU is required', { sku: 'SKU is required' })
  }

  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError('Product name is required', { name: 'Name is required' })
  }

  const now = new Date().toISOString()

  try {
    const [product] = await db
      .insert(products)
      .values({
        companyId,
        sku: input.sku.trim(),
        name: input.name.trim(),
        description: input.description ?? null,
        barcode: input.barcode ?? null,
        costPrice: input.costPrice ?? null,
        salePrice: input.salePrice ?? null,
        categoryId: input.categoryId ?? null,
        unitId: input.unitId ?? null,
        trackInventory: input.trackInventory ?? false,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      .returning()

    return product
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(`A product with SKU "${input.sku.trim()}" already exists`)
    }
    throw error
  }
}

/**
 * Updates an existing product.
 *
 * Throws NotFoundError if the product does not exist or does not belong to the company.
 * Throws ValidationError if name is provided but empty.
 */
export async function update(companyId: number, id: number, input: UpdateProductInput): Promise<Product> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Product not found')
  }

  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError('Product name cannot be empty', { name: 'Name cannot be empty' })
  }

  const now = new Date().toISOString()

  const [updated] = await db
    .update(products)
    .set({
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.barcode !== undefined && { barcode: input.barcode }),
      ...(input.costPrice !== undefined && { costPrice: input.costPrice }),
      ...(input.salePrice !== undefined && { salePrice: input.salePrice }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.unitId !== undefined && { unitId: input.unitId }),
      ...(input.trackInventory !== undefined && { trackInventory: input.trackInventory }),
      ...(input.status !== undefined && { status: input.status }),
      updatedAt: now
    })
    .where(and(eq(products.id, id), eq(products.companyId, companyId)))
    .returning()

  return updated
}

/**
 * Deletes a product.
 *
 * Throws NotFoundError if the product does not exist or does not belong to the company.
 * Throws EntityReferencedError if the product has trackInventory=true and stock movements exist.
 */
export async function deleteProduct(companyId: number, id: number): Promise<void> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Product not found')
  }

  // Guard: prevent deletion if trackInventory is true and stock movements exist
  if (existing.trackInventory) {
    const [movement] = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(and(eq(stockMovements.productId, id), eq(stockMovements.companyId, companyId)))
      .limit(1)

    if (movement) {
      throw new EntityReferencedError('Cannot delete product because it has active stock movements')
    }
  }

  await db.delete(products).where(and(eq(products.id, id), eq(products.companyId, companyId)))
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
