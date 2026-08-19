/**
 * StockService — Transactional stock operations for inventory management.
 *
 * All operations are company-scoped and execute within SQLite transactions.
 * Enforces:
 * - Product existence, company ownership, and trackInventory=true before movements
 * - Materialized balance updates (stock record upsert) alongside every movement
 * - Non-negative stock constraint on outbound/decrease operations
 * - Immutable movement records (no update/delete)
 */

import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm'

import { InsufficientStockError, InvalidMovementError, NotFoundError, TransferSameWarehouseError } from '../api/errors'
import { products, stock, stockAdjustments, stockMovements, warehouses } from '../db/schema'
import { getDb } from '../server'
import { logAudit } from './audit-service'
import type {
  AdjustmentInput,
  InboundMovementInput,
  MovementListFilters,
  OutboundMovementInput,
  PaginatedResult,
  Pagination,
  ReconciliationResult,
  StockAdjustment,
  StockBalance,
  StockMovement,
  TransferInput,
  WarehouseStockItem
} from './types'
import { ADJUSTMENT_TYPES, MOVEMENT_TYPES } from './types'

/**
 * Records an inbound stock movement and updates the materialized balance.
 *
 * Within a single transaction:
 * 1. Validates the product exists, belongs to the company, and has trackInventory=true
 * 2. Creates a stock movement record with type "inbound"
 * 3. Upserts the stock record (insert if new, increment quantity if exists)
 *
 * @throws NotFoundError if the product does not exist or does not belong to the company
 * @throws InvalidMovementError if the product does not have trackInventory enabled
 */
export async function recordInbound(companyId: number, input: InboundMovementInput): Promise<StockMovement> {
  const db = getDb()

  return db.transaction(async (tx) => {
    // 1. Validate product exists, belongs to company, has trackInventory=true
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.companyId, companyId)))

    if (!product) {
      throw new NotFoundError('Product not found')
    }

    if (!product.trackInventory) {
      throw new InvalidMovementError('Product does not track inventory')
    }

    // 2. Create movement record
    const now = new Date().toISOString()

    const [movement] = await tx
      .insert(stockMovements)
      .values({
        companyId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        movementType: MOVEMENT_TYPES.inbound,
        quantity: input.quantity,
        unitCost: input.unitCost ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
        createdAt: now
      })
      .returning()

    // 3. Upsert stock record (insert if not exists, increment quantity if exists)
    await tx
      .insert(stock)
      .values({
        companyId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        reservedQuantity: 0,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [stock.companyId, stock.productId, stock.warehouseId],
        set: {
          quantity: sql`${stock.quantity} + ${input.quantity}`,
          updatedAt: now
        }
      })

    return movement
  })
}

/**
 * Records an outbound stock movement and updates the materialized balance.
 *
 * Within a single transaction:
 * 1. Validates the product exists, belongs to the company, and has trackInventory=true
 * 2. Checks the current stock balance at the specified warehouse
 * 3. Rejects the operation if available stock is insufficient (non-negative enforcement)
 * 4. Creates a stock movement record with type "outbound"
 * 5. Decrements the stock record quantity
 *
 * @throws NotFoundError if the product does not exist or does not belong to the company
 * @throws InvalidMovementError if the product does not have trackInventory enabled
 * @throws InsufficientStockError if the current balance is less than the requested quantity
 */
export async function recordOutbound(companyId: number, input: OutboundMovementInput): Promise<StockMovement> {
  const db = getDb()

  return db.transaction(async (tx) => {
    // 1. Validate product exists, belongs to company, has trackInventory=true
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.companyId, companyId)))

    if (!product) {
      throw new NotFoundError('Product not found')
    }

    if (!product.trackInventory) {
      throw new InvalidMovementError('Product does not track inventory')
    }

    // 2. Check current stock balance at the warehouse
    const [stockRecord] = await tx
      .select()
      .from(stock)
      .where(
        and(
          eq(stock.companyId, companyId),
          eq(stock.productId, input.productId),
          eq(stock.warehouseId, input.warehouseId)
        )
      )

    const currentQuantity = stockRecord?.quantity ?? 0

    // 3. Reject if balance would go negative
    if (currentQuantity < input.quantity) {
      throw new InsufficientStockError(`Insufficient stock: available ${currentQuantity}, requested ${input.quantity}`)
    }

    // 4. Create movement record
    const now = new Date().toISOString()

    const [movement] = await tx
      .insert(stockMovements)
      .values({
        companyId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        movementType: MOVEMENT_TYPES.outbound,
        quantity: input.quantity,
        unitCost: input.unitCost ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
        createdAt: now
      })
      .returning()

    // 5. Decrement stock record
    await tx
      .update(stock)
      .set({
        quantity: sql`${stock.quantity} - ${input.quantity}`,
        updatedAt: now
      })
      .where(
        and(
          eq(stock.companyId, companyId),
          eq(stock.productId, input.productId),
          eq(stock.warehouseId, input.warehouseId)
        )
      )

    return movement
  })
}

/**
 * Records a stock transfer between two warehouses as paired movements.
 *
 * Within a single transaction:
 * 1. Validates source and destination warehouses are different
 * 2. Validates the product exists, belongs to the company, and has trackInventory=true
 * 3. Checks the source warehouse has sufficient stock
 * 4. Creates a transfer_out movement at the source warehouse
 * 5. Creates a transfer_in movement at the destination warehouse
 * 6. Decrements the source stock record
 * 7. Upserts the destination stock record (insert if new, increment if exists)
 *
 * @throws TransferSameWarehouseError if source and destination warehouses are the same
 * @throws NotFoundError if the product does not exist or does not belong to the company
 * @throws InvalidMovementError if the product does not have trackInventory enabled
 * @throws InsufficientStockError if the source warehouse does not have enough stock
 */
export async function recordTransfer(
  companyId: number,
  input: TransferInput
): Promise<{ source: StockMovement; destination: StockMovement }> {
  const db = getDb()

  // Validate source != destination
  if (input.sourceWarehouseId === input.destinationWarehouseId) {
    throw new TransferSameWarehouseError()
  }

  return db.transaction(async (tx) => {
    // 1. Validate product exists, belongs to company, has trackInventory=true
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.companyId, companyId)))

    if (!product) {
      throw new NotFoundError('Product not found')
    }

    if (!product.trackInventory) {
      throw new InvalidMovementError('Product does not track inventory')
    }

    // 2. Check source warehouse has sufficient stock
    const [sourceStockRecord] = await tx
      .select()
      .from(stock)
      .where(
        and(
          eq(stock.companyId, companyId),
          eq(stock.productId, input.productId),
          eq(stock.warehouseId, input.sourceWarehouseId)
        )
      )

    const sourceQuantity = sourceStockRecord?.quantity ?? 0

    if (sourceQuantity < input.quantity) {
      throw new InsufficientStockError(`Insufficient stock: available ${sourceQuantity}, requested ${input.quantity}`)
    }

    // 3. Create transfer_out movement at source warehouse
    const now = new Date().toISOString()

    const [sourceMovement] = await tx
      .insert(stockMovements)
      .values({
        companyId,
        productId: input.productId,
        warehouseId: input.sourceWarehouseId,
        movementType: MOVEMENT_TYPES.transfer_out,
        quantity: input.quantity,
        unitCost: null,
        referenceType: null,
        referenceId: null,
        notes: input.notes ?? null,
        createdAt: now
      })
      .returning()

    // 4. Create transfer_in movement at destination warehouse
    const [destinationMovement] = await tx
      .insert(stockMovements)
      .values({
        companyId,
        productId: input.productId,
        warehouseId: input.destinationWarehouseId,
        movementType: MOVEMENT_TYPES.transfer_in,
        quantity: input.quantity,
        unitCost: null,
        referenceType: null,
        referenceId: null,
        notes: input.notes ?? null,
        createdAt: now
      })
      .returning()

    // 5. Decrement source stock record
    await tx
      .update(stock)
      .set({
        quantity: sql`${stock.quantity} - ${input.quantity}`,
        updatedAt: now
      })
      .where(
        and(
          eq(stock.companyId, companyId),
          eq(stock.productId, input.productId),
          eq(stock.warehouseId, input.sourceWarehouseId)
        )
      )

    // 6. Upsert destination stock record (insert if not exists, increment if exists)
    await tx
      .insert(stock)
      .values({
        companyId,
        productId: input.productId,
        warehouseId: input.destinationWarehouseId,
        quantity: input.quantity,
        reservedQuantity: 0,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [stock.companyId, stock.productId, stock.warehouseId],
        set: {
          quantity: sql`${stock.quantity} + ${input.quantity}`,
          updatedAt: now
        }
      })

    return { source: sourceMovement, destination: destinationMovement }
  })
}

/**
 * Returns stock balances per warehouse for a specific product.
 *
 * Queries all stock records for the given product within the company,
 * joining with the warehouses table to include warehouse name and code.
 *
 * @throws None — returns an empty array if no stock records exist for the product
 */
export async function getProductBalances(companyId: number, productId: number): Promise<StockBalance[]> {
  const db = getDb()

  const rows = await db
    .select({
      warehouseId: stock.warehouseId,
      warehouseName: warehouses.name,
      warehouseCode: warehouses.code,
      quantity: stock.quantity,
      reservedQuantity: stock.reservedQuantity
    })
    .from(stock)
    .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
    .where(and(eq(stock.companyId, companyId), eq(stock.productId, productId)))

  return rows.map((row) => ({
    warehouseId: row.warehouseId,
    warehouseName: row.warehouseName,
    warehouseCode: row.warehouseCode,
    quantity: row.quantity,
    reservedQuantity: row.reservedQuantity
  }))
}

/**
 * Returns a paginated list of products with their stock at a specific warehouse.
 *
 * Queries stock records for the given warehouse within the company,
 * joining with the products table to include product name and SKU.
 * Supports limit/offset pagination with total count for client-side controls.
 *
 * @throws None — returns an empty result set if no stock records exist at the warehouse
 */
export async function getWarehouseOverview(
  companyId: number,
  warehouseId: number,
  pagination: Pagination
): Promise<PaginatedResult<WarehouseStockItem>> {
  const db = getDb()
  const limit = pagination.limit || 20
  const offset = pagination.offset || 0

  const whereClause = and(eq(stock.companyId, companyId), eq(stock.warehouseId, warehouseId))

  // Count query
  const [countResult] = await db.select({ total: count() }).from(stock).where(whereClause)
  const total = countResult?.total ?? 0

  // Data query with product join
  const rows = await db
    .select({
      productId: stock.productId,
      productName: products.name,
      productSku: products.sku,
      quantity: stock.quantity,
      reservedQuantity: stock.reservedQuantity
    })
    .from(stock)
    .innerJoin(products, eq(stock.productId, products.id))
    .where(whereClause)
    .limit(limit)
    .offset(offset)

  const data: WarehouseStockItem[] = rows.map((row) => ({
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku,
    quantity: row.quantity,
    reservedQuantity: row.reservedQuantity
  }))

  return { data, total, limit, offset }
}

/**
 * Creates a stock adjustment with a corresponding movement and updates the materialized balance.
 *
 * Within a single transaction:
 * 1. Validates the product exists, belongs to the company, and has trackInventory=true
 * 2. For "decrease" adjustments, checks current stock and rejects if it would go negative
 * 3. Creates a stock_adjustment record
 * 4. Creates a corresponding stock_movement with type "adjustment"
 * 5. Updates the stock record (increment for increase, decrement for decrease/correction)
 *
 * After the transaction succeeds, logs an audit entry via AuditService.
 *
 * @throws NotFoundError if the product does not exist or does not belong to the company
 * @throws InvalidMovementError if the product does not have trackInventory enabled
 * @throws InsufficientStockError if a decrease adjustment would cause a negative balance
 */
export async function createAdjustment(companyId: number, input: AdjustmentInput): Promise<StockAdjustment> {
  const db = getDb()

  const adjustment = await db.transaction(async (tx) => {
    // 1. Validate product exists, belongs to company, has trackInventory=true
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.companyId, companyId)))

    if (!product) {
      throw new NotFoundError('Product not found')
    }

    if (!product.trackInventory) {
      throw new InvalidMovementError('Product does not track inventory')
    }

    // 2. For "decrease" adjustments, check current stock and reject if would go negative
    if (input.adjustmentType === ADJUSTMENT_TYPES.decrease) {
      const [stockRecord] = await tx
        .select()
        .from(stock)
        .where(
          and(
            eq(stock.companyId, companyId),
            eq(stock.productId, input.productId),
            eq(stock.warehouseId, input.warehouseId)
          )
        )

      const currentQuantity = stockRecord?.quantity ?? 0

      if (currentQuantity < input.quantity) {
        throw new InsufficientStockError(
          `Insufficient stock: available ${currentQuantity}, requested ${input.quantity}`
        )
      }
    }

    // 3. Create stock_adjustment record
    const now = new Date().toISOString()

    const [adjustmentRecord] = await tx
      .insert(stockAdjustments)
      .values({
        companyId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        adjustmentType: input.adjustmentType,
        quantity: input.quantity,
        unitCost: input.unitCost ?? null,
        reason: input.reason,
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId,
        createdAt: now
      })
      .returning()

    // 4. Create corresponding stock_movement with type "adjustment"
    await tx.insert(stockMovements).values({
      companyId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      movementType: MOVEMENT_TYPES.adjustment,
      quantity: input.quantity,
      unitCost: input.unitCost ?? null,
      referenceType: 'stock_adjustment',
      referenceId: String(adjustmentRecord.id),
      notes: input.notes ?? null,
      createdAt: now
    })

    // 5. Update stock record based on adjustment type
    if (input.adjustmentType === ADJUSTMENT_TYPES.increase || input.adjustmentType === ADJUSTMENT_TYPES.correction) {
      // For increase and correction: upsert stock record, incrementing quantity
      await tx
        .insert(stock)
        .values({
          companyId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          reservedQuantity: 0,
          createdAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: [stock.companyId, stock.productId, stock.warehouseId],
          set: {
            quantity: sql`${stock.quantity} + ${input.quantity}`,
            updatedAt: now
          }
        })
    } else {
      // For decrease: decrement stock record (already validated non-negative above)
      await tx
        .update(stock)
        .set({
          quantity: sql`${stock.quantity} - ${input.quantity}`,
          updatedAt: now
        })
        .where(
          and(
            eq(stock.companyId, companyId),
            eq(stock.productId, input.productId),
            eq(stock.warehouseId, input.warehouseId)
          )
        )
    }

    return adjustmentRecord
  })

  // After transaction succeeds, log audit entry (separate concern)
  await logAudit({
    companyId,
    entityType: 'stock_adjustment',
    entityId: String(adjustment.id),
    action: 'create',
    userId: input.createdByUserId
  })

  return adjustment
}

/**
 * Returns a paginated, filterable list of stock movements for the active company.
 *
 * Supports filtering by productId, warehouseId, movementType, and date range (startDate, endDate).
 * Results are ordered by creation date descending (most recent first).
 *
 * @throws None — returns an empty result set if no movements match the filters
 */
export async function listMovements(
  companyId: number,
  filters: MovementListFilters
): Promise<PaginatedResult<StockMovement>> {
  const db = getDb()
  const limit = filters.limit || 20
  const offset = filters.offset || 0

  const conditions = [eq(stockMovements.companyId, companyId)]

  if (filters.productId !== undefined) {
    conditions.push(eq(stockMovements.productId, filters.productId))
  }

  if (filters.warehouseId !== undefined) {
    conditions.push(eq(stockMovements.warehouseId, filters.warehouseId))
  }

  if (filters.movementType !== undefined) {
    conditions.push(eq(stockMovements.movementType, filters.movementType))
  }

  if (filters.startDate !== undefined) {
    conditions.push(gte(stockMovements.createdAt, filters.startDate))
  }

  if (filters.endDate !== undefined) {
    conditions.push(lte(stockMovements.createdAt, filters.endDate))
  }

  const whereClause = and(...conditions)

  // Count query
  const [countResult] = await db.select({ total: count() }).from(stockMovements).where(whereClause)
  const total = countResult?.total ?? 0

  // Data query ordered by creation date descending
  const data = await db
    .select()
    .from(stockMovements)
    .where(whereClause)
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit)
    .offset(offset)

  return { data, total, limit, offset }
}

/**
 * Reconciles the materialized stock balance against the computed balance from movement history.
 *
 * 1. Fetches all movements for the given product+warehouse combination
 * 2. Computes the expected balance by replaying movements:
 *    - inbound and transfer_in ADD to the balance
 *    - outbound and transfer_out SUBTRACT from the balance
 *    - adjustment direction is determined by looking up the referenced stock_adjustment record
 * 3. Reads the current materialized stock record
 * 4. Returns computed vs materialized balance, discrepancy, and consistency flag
 *
 * @throws None — returns a result even if no movements or stock record exist
 */
export async function reconcile(
  companyId: number,
  productId: number,
  warehouseId: number
): Promise<ReconciliationResult> {
  const db = getDb()

  // 1. Get all movements for this product+warehouse within the company
  const movements = await db
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.companyId, companyId),
        eq(stockMovements.productId, productId),
        eq(stockMovements.warehouseId, warehouseId)
      )
    )

  // 2. Compute expected balance from movements
  let computedBalance = 0

  for (const m of movements) {
    if (m.movementType === MOVEMENT_TYPES.inbound || m.movementType === MOVEMENT_TYPES.transfer_in) {
      computedBalance += m.quantity
    } else if (m.movementType === MOVEMENT_TYPES.outbound || m.movementType === MOVEMENT_TYPES.transfer_out) {
      computedBalance -= m.quantity
    } else if (m.movementType === MOVEMENT_TYPES.adjustment) {
      // For adjustment movements, determine direction from the referenced stock_adjustment
      if (m.referenceType === 'stock_adjustment' && m.referenceId) {
        const [adj] = await db
          .select()
          .from(stockAdjustments)
          .where(eq(stockAdjustments.id, Number(m.referenceId)))

        if (adj && adj.adjustmentType === ADJUSTMENT_TYPES.decrease) {
          computedBalance -= m.quantity
        } else {
          // increase or correction both add to the balance
          computedBalance += m.quantity
        }
      } else {
        // Fallback: treat as increase if no adjustment reference
        computedBalance += m.quantity
      }
    }
  }

  // 3. Get materialized balance from stock record
  const [stockRecord] = await db
    .select()
    .from(stock)
    .where(and(eq(stock.companyId, companyId), eq(stock.productId, productId), eq(stock.warehouseId, warehouseId)))

  const materializedBalance = stockRecord?.quantity ?? 0
  const discrepancy = computedBalance - materializedBalance

  return {
    productId,
    warehouseId,
    computedBalance,
    materializedBalance,
    discrepancy,
    isConsistent: discrepancy === 0
  }
}
