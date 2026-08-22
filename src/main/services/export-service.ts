/**
 * ExportService — Bulk entity data export to CSV.
 *
 * Provides:
 * - `exportEntities(companyId, input)` — generates a CSV file with the same column
 *   structure as the import flow (round-trip compatibility), UTF-8 BOM, semicolon
 *   delimiter, and header row. Stores files in a structured directory.
 *
 * Supported entity types: products, customers, suppliers, categories,
 * sales_orders, purchase_orders, inventory_movements.
 *
 * All queries are company-scoped. Files are written off the renderer thread.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { and, eq, gte, lte } from 'drizzle-orm'
import { app } from 'electron'
import { match } from 'ts-pattern'

import {
  categories,
  customers,
  orders,
  products,
  purchaseOrders,
  stockMovements,
  suppliers,
  warehouses
} from '../db/schema'
import { getDb } from '../server'
import type {
  EntityExportFilters,
  ExportableEntityType,
  ExportEntitiesInput,
  ExportFileResult
} from '../types/phase4-types'

// ---------------------------------------------------------------------------
// Column Definitions (matching import schema for round-trip compatibility)
// ---------------------------------------------------------------------------

const ENTITY_COLUMNS: Record<ExportableEntityType, string[]> = {
  products: ['sku', 'name', 'costPrice', 'salePrice', 'barcode', 'categoryName'],
  customers: ['name', 'documentNumber', 'email', 'phone', 'customerType'],
  suppliers: ['name', 'documentNumber', 'email', 'phone'],
  categories: ['name', 'parentCategoryName'],
  sales_orders: ['orderNumber', 'customerName', 'status', 'totalAmount', 'createdAt'],
  purchase_orders: ['orderNumber', 'supplierName', 'status', 'totalAmount', 'createdAt'],
  inventory_movements: ['productName', 'warehouseName', 'movementType', 'quantity', 'unitCost', 'createdAt']
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Exports entity data to a CSV file.
 *
 * Queries all records of the specified entity type for the given company,
 * applies optional filters, maps to the import-compatible column structure,
 * and writes a UTF-8 BOM CSV with semicolon delimiters.
 *
 * @returns ExportFileResult with filePath, fileSize, and recordCount
 */
export async function exportEntities(companyId: number, input: ExportEntitiesInput): Promise<ExportFileResult> {
  const { entityType, filters } = input

  // Query data for the entity type
  const rows = await queryEntityData(companyId, entityType, filters)

  // Generate CSV content
  const columns = ENTITY_COLUMNS[entityType]
  const csvContent = generateCsv(columns, rows)

  // Write to structured directory
  const filePath = writeExportFile(companyId, entityType, csvContent)

  // Get file size
  const stats = statSync(filePath)

  return {
    filePath,
    fileSize: stats.size,
    recordCount: rows.length
  }
}

// ---------------------------------------------------------------------------
// Query Builders (per entity type)
// ---------------------------------------------------------------------------

type EntityRow = Record<string, string | number | null>

async function queryEntityData(
  companyId: number,
  entityType: ExportableEntityType,
  filters?: EntityExportFilters
): Promise<EntityRow[]> {
  return match(entityType)
    .with('products', () => queryProducts(companyId, filters))
    .with('customers', () => queryCustomers(companyId, filters))
    .with('suppliers', () => querySuppliers(companyId, filters))
    .with('categories', () => queryCategories(companyId, filters))
    .with('sales_orders', () => querySalesOrders(companyId, filters))
    .with('purchase_orders', () => queryPurchaseOrders(companyId, filters))
    .with('inventory_movements', () => queryInventoryMovements(companyId, filters))
    .exhaustive()
}

async function queryProducts(companyId: number, filters?: EntityExportFilters): Promise<EntityRow[]> {
  const db = getDb()

  const conditions = [eq(products.companyId, companyId)]

  if (filters?.categoryId) {
    conditions.push(eq(products.categoryId, filters.categoryId))
  }
  if (filters?.status) {
    conditions.push(eq(products.status, filters.status))
  }

  // Left join categories to get categoryName
  const rows = await db
    .select({
      sku: products.sku,
      name: products.name,
      costPrice: products.costPrice,
      salePrice: products.salePrice,
      barcode: products.barcode,
      categoryName: categories.name
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))

  return rows.map((row) => ({
    sku: row.sku,
    name: row.name,
    costPrice: row.costPrice,
    salePrice: row.salePrice,
    barcode: row.barcode,
    categoryName: row.categoryName
  }))
}

async function queryCustomers(companyId: number, filters?: EntityExportFilters): Promise<EntityRow[]> {
  const db = getDb()

  const conditions = [eq(customers.companyId, companyId)]

  if (filters?.status) {
    conditions.push(eq(customers.status, filters.status))
  }
  if (filters?.startDate) {
    conditions.push(gte(customers.createdAt, filters.startDate))
  }
  if (filters?.endDate) {
    conditions.push(lte(customers.createdAt, filters.endDate))
  }

  const rows = await db
    .select({
      name: customers.name,
      documentNumber: customers.documentNumber,
      email: customers.email,
      phone: customers.phone,
      customerType: customers.customerType
    })
    .from(customers)
    .where(and(...conditions))

  return rows.map((row) => ({
    name: row.name,
    documentNumber: row.documentNumber,
    email: row.email,
    phone: row.phone,
    customerType: row.customerType
  }))
}

async function querySuppliers(companyId: number, filters?: EntityExportFilters): Promise<EntityRow[]> {
  const db = getDb()

  const conditions = [eq(suppliers.companyId, companyId)]

  if (filters?.status) {
    conditions.push(eq(suppliers.status, filters.status))
  }
  if (filters?.startDate) {
    conditions.push(gte(suppliers.createdAt, filters.startDate))
  }
  if (filters?.endDate) {
    conditions.push(lte(suppliers.createdAt, filters.endDate))
  }

  const rows = await db
    .select({
      name: suppliers.name,
      documentNumber: suppliers.documentNumber,
      email: suppliers.email,
      phone: suppliers.phone
    })
    .from(suppliers)
    .where(and(...conditions))

  return rows.map((row) => ({
    name: row.name,
    documentNumber: row.documentNumber,
    email: row.email,
    phone: row.phone
  }))
}

async function queryCategories(companyId: number, filters?: EntityExportFilters): Promise<EntityRow[]> {
  const db = getDb()

  const conditions = [eq(categories.companyId, companyId)]

  if (filters?.status) {
    conditions.push(eq(categories.status, filters.status))
  }

  // Self-join to resolve parent category name
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentCategoryId: categories.parentCategoryId
    })
    .from(categories)
    .where(and(...conditions))

  // Resolve parent names with a second pass (SQLite self-join complexity)
  const categoryMap = new Map<number, string>()
  for (const row of rows) {
    categoryMap.set(row.id, row.name)
  }

  return rows.map((row) => ({
    name: row.name,
    parentCategoryName: row.parentCategoryId ? (categoryMap.get(row.parentCategoryId) ?? null) : null
  }))
}

async function querySalesOrders(companyId: number, filters?: EntityExportFilters): Promise<EntityRow[]> {
  const db = getDb()

  const conditions = [eq(orders.companyId, companyId), eq(orders.orderType, 'sale')]

  if (filters?.status) {
    conditions.push(eq(orders.status, filters.status))
  }
  if (filters?.startDate) {
    conditions.push(gte(orders.createdAt, filters.startDate))
  }
  if (filters?.endDate) {
    conditions.push(lte(orders.createdAt, filters.endDate))
  }

  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      customerName: customers.name,
      status: orders.status,
      totalAmount: orders.totalAmount,
      createdAt: orders.createdAt
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(...conditions))

  return rows.map((row) => ({
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    status: row.status,
    totalAmount: row.totalAmount,
    createdAt: row.createdAt
  }))
}

async function queryPurchaseOrders(companyId: number, filters?: EntityExportFilters): Promise<EntityRow[]> {
  const db = getDb()

  const conditions = [eq(purchaseOrders.companyId, companyId)]

  if (filters?.status) {
    conditions.push(eq(purchaseOrders.status, filters.status))
  }
  if (filters?.startDate) {
    conditions.push(gte(purchaseOrders.createdAt, filters.startDate))
  }
  if (filters?.endDate) {
    conditions.push(lte(purchaseOrders.createdAt, filters.endDate))
  }

  const rows = await db
    .select({
      orderNumber: purchaseOrders.orderNumber,
      supplierName: suppliers.name,
      status: purchaseOrders.status,
      totalAmount: purchaseOrders.totalAmount,
      createdAt: purchaseOrders.createdAt
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(and(...conditions))

  return rows.map((row) => ({
    orderNumber: row.orderNumber,
    supplierName: row.supplierName,
    status: row.status,
    totalAmount: row.totalAmount,
    createdAt: row.createdAt
  }))
}

async function queryInventoryMovements(companyId: number, filters?: EntityExportFilters): Promise<EntityRow[]> {
  const db = getDb()

  const conditions = [eq(stockMovements.companyId, companyId)]

  if (filters?.startDate) {
    conditions.push(gte(stockMovements.createdAt, filters.startDate))
  }
  if (filters?.endDate) {
    conditions.push(lte(stockMovements.createdAt, filters.endDate))
  }

  const rows = await db
    .select({
      productName: products.name,
      warehouseName: warehouses.name,
      movementType: stockMovements.movementType,
      quantity: stockMovements.quantity,
      unitCost: stockMovements.unitCost,
      createdAt: stockMovements.createdAt
    })
    .from(stockMovements)
    .leftJoin(products, eq(stockMovements.productId, products.id))
    .leftJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
    .where(and(...conditions))

  return rows.map((row) => ({
    productName: row.productName,
    warehouseName: row.warehouseName,
    movementType: row.movementType,
    quantity: row.quantity,
    unitCost: row.unitCost,
    createdAt: row.createdAt
  }))
}

// ---------------------------------------------------------------------------
// CSV Generation
// ---------------------------------------------------------------------------

/** UTF-8 BOM prefix for Excel/LibreOffice compatibility. */
const UTF8_BOM = '\uFEFF'

/** Semicolon delimiter matching the import flow. */
const DELIMITER = ';'

/**
 * Generates CSV content with UTF-8 BOM, header row, and semicolon delimiter.
 */
function generateCsv(columns: string[], rows: EntityRow[]): string {
  const lines: string[] = []

  // Header row
  lines.push(columns.join(DELIMITER))

  // Data rows
  for (const row of rows) {
    const values = columns.map((col) => escapeCsvValue(row[col]))
    lines.push(values.join(DELIMITER))
  }

  return UTF8_BOM + lines.join('\n')
}

/**
 * Escapes a CSV value for safe inclusion. Handles null, numbers, and strings
 * that may contain the delimiter, quotes, or newlines.
 */
function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }

  const str = String(value)

  // If value contains delimiter, quotes, or newlines, wrap in quotes
  if (str.includes(DELIMITER) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/**
 * Returns the base data directory for exports.
 * Uses Electron's userData path.
 */
function getDataDir(): string {
  return app.getPath('userData')
}

/**
 * Builds the structured directory path for entity exports.
 * Pattern: {userData}/{companyId}/exports/entities/{entityType}
 */
function getEntityExportDir(companyId: number, entityType: string): string {
  return join(getDataDir(), String(companyId), 'exports', 'entities', entityType)
}

/**
 * Writes the export CSV content to a file in the structured directory.
 * Creates directories recursively if they don't exist.
 *
 * @returns The full path to the written file
 */
function writeExportFile(companyId: number, entityType: string, content: string): string {
  const dir = getEntityExportDir(companyId, entityType)
  mkdirSync(dir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${entityType}_${timestamp}.csv`
  const filePath = join(dir, filename)

  writeFileSync(filePath, content, 'utf-8')

  return filePath
}
