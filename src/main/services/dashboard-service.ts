/**
 * DashboardService — Cached dashboard aggregate computation.
 *
 * Provides precomputed metrics (sales, purchases, receivables, payables,
 * overdue amounts, inventory value, low-stock count) served from an in-memory
 * cache when fresh. Recomputes on demand or when the staleness threshold is
 * exceeded.
 *
 * The cache is keyed by (companyId, periodKey) and stores computed metrics
 * alongside a timestamp. Aggregates are also persisted to the
 * `dashboard_aggregates` table for resilience across restarts.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 15.1, 15.2
 */

import { and, eq, gte, inArray, lt, lte, sql, sum } from 'drizzle-orm'
import { match } from 'ts-pattern'

import { dashboardAggregates, installments, orders, products, purchaseOrders, stock } from '../db/schema'
import { getDb } from '../server'
import type { DashboardAggregateSet, DashboardMetrics, DashboardPeriod } from '../types/phase4-types'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default staleness threshold in milliseconds (5 minutes). */
export const CACHE_STALENESS_MS = 5 * 60 * 1000

/** Default minimum stock threshold for "low stock" metric. */
export const LOW_STOCK_THRESHOLD = 5

// ---------------------------------------------------------------------------
// In-Memory Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  aggregates: DashboardAggregateSet
  computedAt: number
}

const cache = new Map<string, CacheEntry>()

function buildCacheKey(companyId: number, periodKey: string): string {
  return `${companyId}:${periodKey}`
}

function isCacheFresh(entry: CacheEntry, stalenessMs: number): boolean {
  return Date.now() - entry.computedAt < stalenessMs
}

/**
 * Clears the in-memory cache. Useful for testing.
 */
export function clearCache(): void {
  cache.clear()
}

// ---------------------------------------------------------------------------
// Period Helpers
// ---------------------------------------------------------------------------

interface PeriodBounds {
  startDate: string
  endDate: string
}

/**
 * Resolves a DashboardPeriod discriminated union into concrete ISO date bounds.
 * Uses ts-pattern match for exhaustive period type handling.
 */
export function resolvePeriodBounds(period: DashboardPeriod): PeriodBounds {
  return match(period)
    .with({ type: 'current_month' }, () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      }
    })
    .with({ type: 'last_30_days' }, () => {
      const now = new Date()
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      const start = new Date(end)
      start.setDate(start.getDate() - 30)
      start.setHours(0, 0, 0, 0)
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      }
    })
    .with({ type: 'custom' }, ({ startDate, endDate }) => ({
      startDate,
      endDate
    }))
    .exhaustive()
}

/**
 * Converts a DashboardPeriod into a stable string key for caching.
 */
function buildPeriodKey(period: DashboardPeriod): string {
  return match(period)
    .with({ type: 'current_month' }, () => {
      const now = new Date()
      return `current_month:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    })
    .with({ type: 'last_30_days' }, () => {
      const now = new Date()
      return `last_30_days:${now.toISOString().slice(0, 10)}`
    })
    .with({ type: 'custom' }, ({ startDate, endDate }) => `custom:${startDate}:${endDate}`)
    .exhaustive()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns dashboard aggregates for the given company and period.
 *
 * Checks the in-memory cache first. If a fresh entry exists, returns it
 * immediately. Otherwise computes fresh aggregates, stores them in cache
 * and in the database, then returns the result.
 */
export async function getAggregates(
  companyId: number,
  period: DashboardPeriod,
  stalenessMs: number = CACHE_STALENESS_MS
): Promise<DashboardAggregateSet> {
  const periodKey = buildPeriodKey(period)
  const cacheKey = buildCacheKey(companyId, periodKey)

  const cached = cache.get(cacheKey)
  if (cached && isCacheFresh(cached, stalenessMs)) {
    return cached.aggregates
  }

  return computeAndCache(companyId, period, periodKey)
}

/**
 * Forces recomputation of dashboard aggregates regardless of cache freshness.
 * Updates both in-memory cache and persistent storage.
 */
export async function refreshAggregates(companyId: number, period: DashboardPeriod): Promise<DashboardAggregateSet> {
  const periodKey = buildPeriodKey(period)
  return computeAndCache(companyId, period, periodKey)
}

// ---------------------------------------------------------------------------
// Internal — Computation
// ---------------------------------------------------------------------------

async function computeAndCache(
  companyId: number,
  period: DashboardPeriod,
  periodKey: string
): Promise<DashboardAggregateSet> {
  const metrics = await computeAggregates(companyId, period)
  const now = new Date().toISOString()

  const result: DashboardAggregateSet = {
    companyId,
    period,
    lastUpdatedAt: now,
    metrics
  }

  // Update in-memory cache
  const cacheKey = buildCacheKey(companyId, periodKey)
  cache.set(cacheKey, { aggregates: result, computedAt: Date.now() })

  // Persist to database
  await persistAggregates(companyId, periodKey, metrics, now)

  return result
}

/**
 * Executes batched indexed queries to compute all dashboard metrics.
 *
 * Queries are intentionally parallel-safe (no interdependencies) and use
 * indexed columns for performance on large datasets.
 */
async function computeAggregates(companyId: number, period: DashboardPeriod): Promise<DashboardMetrics> {
  const db = getDb()
  const { startDate, endDate } = resolvePeriodBounds(period)
  const now = new Date().toISOString()

  // Execute all aggregate queries in parallel for performance
  const [
    salesResult,
    purchasesResult,
    receivablesResult,
    payablesResult,
    overdueReceivablesResult,
    overduePayablesResult,
    inventoryValueResult,
    lowStockResult
  ] = await Promise.all([
    // 1. Total sales (current period): sum of orders.totalAmount where orderType='sale'
    //    and status in ['confirmed','fulfilled'] and confirmedAt within period
    db
      .select({ total: sum(orders.totalAmount) })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, companyId),
          eq(orders.orderType, 'sale'),
          inArray(orders.status, ['confirmed', 'fulfilled']),
          gte(orders.confirmedAt, startDate),
          lte(orders.confirmedAt, endDate)
        )
      ),

    // 2. Total purchases (current period): sum of purchaseOrders.totalAmount
    //    where status in ['confirmed','received'] and createdAt within period
    db
      .select({ total: sum(purchaseOrders.totalAmount) })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.companyId, companyId),
          inArray(purchaseOrders.status, ['confirmed', 'received']),
          gte(purchaseOrders.createdAt, startDate),
          lte(purchaseOrders.createdAt, endDate)
        )
      ),

    // 3. Total receivables: sum of installments.amount where orderType='sale' and status='pending'
    db
      .select({ total: sum(installments.amount) })
      .from(installments)
      .where(
        and(
          eq(installments.companyId, companyId),
          eq(installments.orderType, 'sale'),
          eq(installments.status, 'pending')
        )
      ),

    // 4. Total payables: sum of installments.amount where orderType='purchase' and status='pending'
    db
      .select({ total: sum(installments.amount) })
      .from(installments)
      .where(
        and(
          eq(installments.companyId, companyId),
          eq(installments.orderType, 'purchase'),
          eq(installments.status, 'pending')
        )
      ),

    // 5. Total overdue receivables: receivables where dueDate < now
    db
      .select({ total: sum(installments.amount) })
      .from(installments)
      .where(
        and(
          eq(installments.companyId, companyId),
          eq(installments.orderType, 'sale'),
          eq(installments.status, 'pending'),
          lt(installments.dueDate, now)
        )
      ),

    // 6. Total overdue payables: payables where dueDate < now
    db
      .select({ total: sum(installments.amount) })
      .from(installments)
      .where(
        and(
          eq(installments.companyId, companyId),
          eq(installments.orderType, 'purchase'),
          eq(installments.status, 'pending'),
          lt(installments.dueDate, now)
        )
      ),

    // 7. Current inventory value: sum of stock.quantity * products.costPrice
    //    where trackInventory=true
    db
      .select({
        total: sql<number>`coalesce(sum(${stock.quantity} * ${products.costPrice}), 0)`
      })
      .from(stock)
      .innerJoin(products, eq(stock.productId, products.id))
      .where(and(eq(stock.companyId, companyId), eq(products.trackInventory, true))),

    // 8. Low-stock product count: count of products where total stock quantity
    //    is below the LOW_STOCK_THRESHOLD
    db
      .select({ count: sql<number>`count(distinct ${products.id})` })
      .from(products)
      .leftJoin(stock, and(eq(stock.productId, products.id), eq(stock.companyId, companyId)))
      .where(
        and(
          eq(products.companyId, companyId),
          eq(products.trackInventory, true),
          sql`coalesce(${stock.quantity}, 0) <= ${LOW_STOCK_THRESHOLD}`
        )
      )
  ])

  return {
    totalSales: Number(salesResult[0]?.total) || 0,
    totalPurchases: Number(purchasesResult[0]?.total) || 0,
    totalReceivables: Number(receivablesResult[0]?.total) || 0,
    totalPayables: Number(payablesResult[0]?.total) || 0,
    totalOverdueReceivables: Number(overdueReceivablesResult[0]?.total) || 0,
    totalOverduePayables: Number(overduePayablesResult[0]?.total) || 0,
    currentInventoryValue: Number(inventoryValueResult[0]?.total) || 0,
    lowStockProductCount: Number(lowStockResult[0]?.count) || 0
  }
}

// ---------------------------------------------------------------------------
// Internal — Persistence
// ---------------------------------------------------------------------------

/**
 * Persists computed metrics to the dashboard_aggregates table for resilience
 * across application restarts. Uses upsert (INSERT OR REPLACE) to update
 * existing entries.
 */
async function persistAggregates(
  companyId: number,
  periodKey: string,
  metrics: DashboardMetrics,
  computedAt: string
): Promise<void> {
  const db = getDb()

  const entries = Object.entries(metrics).map(([metricName, value]) => ({
    companyId,
    periodKey,
    metricName,
    value: value as number,
    computedAt
  }))

  for (const entry of entries) {
    await db
      .insert(dashboardAggregates)
      .values(entry)
      .onConflictDoUpdate({
        target: [dashboardAggregates.companyId, dashboardAggregates.periodKey, dashboardAggregates.metricName],
        set: {
          value: entry.value,
          computedAt: entry.computedAt
        }
      })
  }
}
