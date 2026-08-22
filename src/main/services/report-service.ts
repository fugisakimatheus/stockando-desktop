/**
 * ReportService — Business report generation and export.
 *
 * Provides:
 * - `listTemplates()` — returns all predefined report template definitions
 * - `generate(companyId, input)` — dynamic query execution with filters, sorting, grouping, pagination
 * - `exportCsv(companyId, input)` — generates UTF-8 BOM CSV file with formatted columns
 * - `exportPdf(companyId, input)` — generates lightweight text-based PDF table
 *
 * All queries are company-scoped and use indexed columns for performance.
 * Reports execute off the renderer thread (in the Electron main process).
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 15.3, 15.4, 15.5
 */

import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { app } from 'electron'
import { match } from 'ts-pattern'

import { NotFoundError } from '../api/errors'
import {
  customers,
  installments,
  orderItems,
  orders,
  products,
  purchaseOrders,
  stock,
  stockMovements,
  suppliers,
  warehouses
} from '../db/schema'
import { getDb } from '../server'
import type {
  ExportFileResult,
  ExportReportInput,
  GenerateReportInput,
  ReportColumnDefinition,
  ReportGroup,
  ReportResult,
  ReportRow,
  ReportSummary,
  ReportTemplateDefinition
} from '../types/phase4-types'
import { REPORT_TEMPLATES, getReportTemplate } from './report-templates'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all available report template definitions.
 */
export function listTemplates(): ReportTemplateDefinition[] {
  return [...REPORT_TEMPLATES]
}

/**
 * Generates a report based on the given template and input parameters.
 *
 * Builds dynamic queries per template, applies filters, sorting, grouping, and pagination.
 * Returns paginated data rows, optional groups with subtotals, and a summary.
 */
export async function generate(companyId: number, input: GenerateReportInput): Promise<ReportResult> {
  const template = getReportTemplate(input.templateId)
  if (!template) {
    throw new NotFoundError(`Report template "${input.templateId}" not found`)
  }

  const { filters, pagination, sortBy, sortDirection, groupBy } = input

  // Build query result rows based on template
  const allRows = buildQueryForTemplate(companyId, input)

  // Compute total count (from full result set)
  const total = allRows.length

  // Apply sorting
  const sortedRows = applySorting(allRows, sortBy, sortDirection)

  // Apply pagination
  const paginatedRows = sortedRows.slice(pagination.offset, pagination.offset + pagination.limit)

  // Build groups (from full result set, not paginated)
  const groups = groupBy ? buildGroups(sortedRows, groupBy) : undefined

  // Compute summary from full result set
  const summary = computeSummary(sortedRows, template)

  return {
    templateId: input.templateId,
    filters,
    data: paginatedRows,
    groups,
    summary,
    total,
    limit: pagination.limit,
    offset: pagination.offset
  }
}

/**
 * Exports a report to a CSV file with UTF-8 BOM encoding.
 *
 * Generates the full report (no pagination limit) and writes it to disk
 * in a structured directory path.
 */
export async function exportCsv(companyId: number, input: ExportReportInput): Promise<ExportFileResult> {
  const template = getReportTemplate(input.templateId)
  if (!template) {
    throw new NotFoundError(`Report template "${input.templateId}" not found`)
  }

  // Generate full report without pagination
  const fullInput: GenerateReportInput = {
    templateId: input.templateId,
    filters: input.filters,
    groupBy: input.groupBy,
    pagination: { limit: 1_000_000, offset: 0 }
  }

  const allRows = buildQueryForTemplate(companyId, fullInput)
  const sortedRows = applySorting(allRows, undefined, undefined)

  // Build CSV content
  const bom = '\uFEFF'
  const headerRow = template.columns.map((col) => col.label).join(';')
  const dataRows = sortedRows.map((row) => template.columns.map((col) => formatCsvValue(row[col.key], col)).join(';'))

  const csvContent = bom + [headerRow, ...dataRows].join('\n')

  // Determine file path
  const now = new Date()
  const year = now.getFullYear().toString()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const timestamp = now.toISOString().replace(/[:.]/g, '-')
  const fileName = `${input.templateId}_${timestamp}.csv`

  const dirPath = getExportDir(companyId, input.templateId, year, month)
  mkdirSync(dirPath, { recursive: true })

  const filePath = join(dirPath, fileName)
  writeFileSync(filePath, csvContent, 'utf-8')

  const fileSize = statSync(filePath).size

  return {
    filePath,
    fileSize,
    recordCount: sortedRows.length
  }
}

/**
 * Exports a report to a PDF file using a lightweight text-based table format.
 *
 * Since pdfkit is not available in the project, this generates a simple
 * structured text file with .pdf extension containing formatted table data.
 * For production-grade PDF, this can be replaced with a proper PDF renderer.
 */
export async function exportPdf(companyId: number, input: ExportReportInput): Promise<ExportFileResult> {
  const template = getReportTemplate(input.templateId)
  if (!template) {
    throw new NotFoundError(`Report template "${input.templateId}" not found`)
  }

  // Generate full report without pagination
  const fullInput: GenerateReportInput = {
    templateId: input.templateId,
    filters: input.filters,
    groupBy: input.groupBy,
    pagination: { limit: 1_000_000, offset: 0 }
  }

  const allRows = buildQueryForTemplate(companyId, fullInput)
  const sortedRows = applySorting(allRows, undefined, undefined)
  const summary = computeSummary(sortedRows, template)

  // Build simple formatted text content for the PDF
  const lines: string[] = []

  // Title
  lines.push(`${'='.repeat(80)}`)
  lines.push(`  ${template.name}`)
  lines.push(`  ${template.description}`)
  lines.push(`${'='.repeat(80)}`)
  lines.push('')

  // Filters applied
  if (input.filters.startDate || input.filters.endDate) {
    lines.push(`  Período: ${input.filters.startDate ?? '...'} até ${input.filters.endDate ?? '...'}`)
    lines.push('')
  }

  // Column headers
  const colWidths = template.columns.map((col) => Math.max(col.label.length, 15))
  const headerLine = template.columns.map((col, i) => col.label.padEnd(colWidths[i])).join(' | ')
  lines.push(`  ${headerLine}`)
  lines.push(`  ${'-'.repeat(headerLine.length)}`)

  // Data rows
  for (const row of sortedRows) {
    const rowLine = template.columns.map((col, i) => formatPdfValue(row[col.key], col).padEnd(colWidths[i])).join(' | ')
    lines.push(`  ${rowLine}`)
  }

  // Summary
  lines.push('')
  lines.push(`${'='.repeat(80)}`)
  lines.push(`  Resumo:`)
  lines.push(`    Total de Registros: ${summary.totalCount}`)
  lines.push(`    Valor Total: ${formatCurrency(summary.totalAmount)}`)
  lines.push(`    Valor Médio: ${formatCurrency(summary.averageAmount)}`)
  lines.push(`${'='.repeat(80)}`)

  const pdfContent = lines.join('\n')

  // Determine file path
  const now = new Date()
  const year = now.getFullYear().toString()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const timestamp = now.toISOString().replace(/[:.]/g, '-')
  const fileName = `${input.templateId}_${timestamp}.pdf`

  const dirPath = getExportDir(companyId, input.templateId, year, month)
  mkdirSync(dirPath, { recursive: true })

  const filePath = join(dirPath, fileName)
  writeFileSync(filePath, pdfContent, 'utf-8')

  const fileSize = statSync(filePath).size

  return {
    filePath,
    fileSize,
    recordCount: sortedRows.length
  }
}

// ---------------------------------------------------------------------------
// Internal — Query Builders
// ---------------------------------------------------------------------------

/**
 * Builds and executes the query for the given template, applying company scope and filters.
 * Returns all matching rows as ReportRow[].
 */
function buildQueryForTemplate(companyId: number, input: GenerateReportInput): ReportRow[] {
  const { templateId, filters } = input
  const db = getDb()

  return match(templateId)
    .with('sales_by_period', () => {
      const conditions = [
        eq(orders.companyId, companyId),
        eq(orders.orderType, 'sale'),
        sql`${orders.status} IN ('confirmed', 'fulfilled')`
      ]
      if (filters.startDate) conditions.push(gte(orders.createdAt, filters.startDate))
      if (filters.endDate) conditions.push(lte(orders.createdAt, filters.endDate))

      const rows = db
        .select({
          date: orders.createdAt,
          orderCount: sql<number>`1`,
          totalAmount: orders.totalAmount,
          averageAmount: orders.totalAmount
        })
        .from(orders)
        .where(and(...conditions))
        .all()

      return rows.map((r) => ({
        date: r.date?.slice(0, 10) ?? null,
        orderCount: 1,
        totalAmount: r.totalAmount ?? 0,
        averageAmount: r.totalAmount ?? 0
      }))
    })
    .with('sales_by_product', () => {
      const conditions = [
        eq(orders.companyId, companyId),
        eq(orders.orderType, 'sale'),
        sql`${orders.status} IN ('confirmed', 'fulfilled')`
      ]
      if (filters.startDate) conditions.push(gte(orders.createdAt, filters.startDate))
      if (filters.endDate) conditions.push(lte(orders.createdAt, filters.endDate))
      if (filters.categoryId) conditions.push(eq(products.categoryId, filters.categoryId))

      const rows = db
        .select({
          productName: products.name,
          sku: products.sku,
          quantitySold: orderItems.quantity,
          totalAmount: orderItems.totalAmount,
          averagePrice: orderItems.unitPrice
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(and(...conditions))
        .all()

      return rows.map((r) => ({
        productName: r.productName,
        sku: r.sku,
        quantitySold: r.quantitySold ?? 0,
        totalAmount: r.totalAmount ?? 0,
        averagePrice: r.averagePrice ?? 0
      }))
    })
    .with('sales_by_customer', () => {
      const conditions = [
        eq(orders.companyId, companyId),
        eq(orders.orderType, 'sale'),
        sql`${orders.status} IN ('confirmed', 'fulfilled')`
      ]
      if (filters.startDate) conditions.push(gte(orders.createdAt, filters.startDate))
      if (filters.endDate) conditions.push(lte(orders.createdAt, filters.endDate))
      if (filters.customerId) conditions.push(eq(orders.customerId, filters.customerId))

      const rows = db
        .select({
          customerName: customers.name,
          documentNumber: customers.documentNumber,
          orderCount: sql<number>`1`,
          totalAmount: orders.totalAmount,
          averageAmount: orders.totalAmount
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(...conditions))
        .all()

      return rows.map((r) => ({
        customerName: r.customerName ?? 'Sem cliente',
        documentNumber: r.documentNumber ?? '',
        orderCount: 1,
        totalAmount: r.totalAmount ?? 0,
        averageAmount: r.totalAmount ?? 0
      }))
    })
    .with('purchases_by_period', () => {
      const conditions = [eq(purchaseOrders.companyId, companyId)]
      if (filters.startDate) conditions.push(gte(purchaseOrders.createdAt, filters.startDate))
      if (filters.endDate) conditions.push(lte(purchaseOrders.createdAt, filters.endDate))

      const rows = db
        .select({
          date: purchaseOrders.createdAt,
          orderCount: sql<number>`1`,
          totalAmount: purchaseOrders.totalAmount,
          averageAmount: purchaseOrders.totalAmount
        })
        .from(purchaseOrders)
        .where(and(...conditions))
        .all()

      return rows.map((r) => ({
        date: r.date?.slice(0, 10) ?? null,
        orderCount: 1,
        totalAmount: r.totalAmount ?? 0,
        averageAmount: r.totalAmount ?? 0
      }))
    })
    .with('purchases_by_supplier', () => {
      const conditions = [eq(purchaseOrders.companyId, companyId)]
      if (filters.startDate) conditions.push(gte(purchaseOrders.createdAt, filters.startDate))
      if (filters.endDate) conditions.push(lte(purchaseOrders.createdAt, filters.endDate))
      if (filters.supplierId) conditions.push(eq(purchaseOrders.supplierId, filters.supplierId))

      const rows = db
        .select({
          supplierName: suppliers.name,
          documentNumber: suppliers.documentNumber,
          orderCount: sql<number>`1`,
          totalAmount: purchaseOrders.totalAmount,
          averageAmount: purchaseOrders.totalAmount
        })
        .from(purchaseOrders)
        .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .where(and(...conditions))
        .all()

      return rows.map((r) => ({
        supplierName: r.supplierName,
        documentNumber: r.documentNumber,
        orderCount: 1,
        totalAmount: r.totalAmount ?? 0,
        averageAmount: r.totalAmount ?? 0
      }))
    })
    .with('inventory_movements', () => {
      const conditions = [eq(stockMovements.companyId, companyId)]
      if (filters.startDate) conditions.push(gte(stockMovements.createdAt, filters.startDate))
      if (filters.endDate) conditions.push(lte(stockMovements.createdAt, filters.endDate))
      if (filters.productId) conditions.push(eq(stockMovements.productId, filters.productId))
      if (filters.status) conditions.push(eq(stockMovements.movementType, filters.status))

      const rows = db
        .select({
          date: stockMovements.createdAt,
          productName: products.name,
          warehouseName: warehouses.name,
          movementType: stockMovements.movementType,
          quantity: stockMovements.quantity,
          unitCost: stockMovements.unitCost
        })
        .from(stockMovements)
        .innerJoin(products, eq(stockMovements.productId, products.id))
        .innerJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
        .where(and(...conditions))
        .all()

      return rows.map((r) => ({
        date: r.date?.slice(0, 10) ?? null,
        productName: r.productName,
        warehouseName: r.warehouseName,
        movementType: r.movementType,
        quantity: r.quantity ?? 0,
        unitCost: r.unitCost ?? 0
      }))
    })
    .with('stock_levels', () => {
      const conditions = [eq(stock.companyId, companyId)]
      if (filters.categoryId) conditions.push(eq(products.categoryId, filters.categoryId))

      const rows = db
        .select({
          productName: products.name,
          sku: products.sku,
          warehouseName: warehouses.name,
          quantity: stock.quantity,
          reservedQuantity: stock.reservedQuantity,
          unitCost: products.costPrice,
          totalValue: sql<number>`${stock.quantity} * COALESCE(${products.costPrice}, 0)`
        })
        .from(stock)
        .innerJoin(products, eq(stock.productId, products.id))
        .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
        .where(and(...conditions))
        .all()

      return rows.map((r) => ({
        productName: r.productName,
        sku: r.sku,
        warehouseName: r.warehouseName,
        quantity: r.quantity ?? 0,
        reservedQuantity: r.reservedQuantity ?? 0,
        unitCost: r.unitCost ?? 0,
        totalValue: r.totalValue ?? 0
      }))
    })
    .with('receivables_aging', () => {
      const conditions = [eq(installments.companyId, companyId), eq(installments.orderType, 'sale')]
      if (filters.startDate) conditions.push(gte(installments.dueDate, filters.startDate))
      if (filters.endDate) conditions.push(lte(installments.dueDate, filters.endDate))
      if (filters.status) conditions.push(eq(installments.status, filters.status))
      if (filters.customerId) conditions.push(eq(orders.customerId, filters.customerId))

      const today = new Date().toISOString().slice(0, 10)

      const rows = db
        .select({
          customerName: customers.name,
          orderNumber: orders.orderNumber,
          installmentNumber: installments.installmentNumber,
          amount: installments.amount,
          dueDate: installments.dueDate,
          status: installments.status
        })
        .from(installments)
        .innerJoin(orders, and(eq(installments.orderId, orders.id), eq(installments.orderType, 'sale')))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(...conditions))
        .all()

      return rows.map((r) => {
        const dueDate = r.dueDate ?? ''
        const daysOverdue =
          dueDate < today
            ? Math.floor((new Date(today).getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
            : 0

        return {
          customerName: r.customerName ?? 'Sem cliente',
          orderNumber: r.orderNumber,
          installmentNumber: r.installmentNumber ?? 0,
          amount: r.amount ?? 0,
          dueDate,
          daysOverdue,
          status: r.status
        }
      })
    })
    .with('payables_aging', () => {
      const conditions = [eq(installments.companyId, companyId), eq(installments.orderType, 'purchase')]
      if (filters.startDate) conditions.push(gte(installments.dueDate, filters.startDate))
      if (filters.endDate) conditions.push(lte(installments.dueDate, filters.endDate))
      if (filters.status) conditions.push(eq(installments.status, filters.status))
      if (filters.supplierId) conditions.push(eq(purchaseOrders.supplierId, filters.supplierId))

      const today = new Date().toISOString().slice(0, 10)

      const rows = db
        .select({
          supplierName: suppliers.name,
          orderNumber: purchaseOrders.orderNumber,
          installmentNumber: installments.installmentNumber,
          amount: installments.amount,
          dueDate: installments.dueDate,
          status: installments.status
        })
        .from(installments)
        .innerJoin(
          purchaseOrders,
          and(eq(installments.orderId, purchaseOrders.id), eq(installments.orderType, 'purchase'))
        )
        .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .where(and(...conditions))
        .all()

      return rows.map((r) => {
        const dueDate = r.dueDate ?? ''
        const daysOverdue =
          dueDate < today
            ? Math.floor((new Date(today).getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
            : 0

        return {
          supplierName: r.supplierName,
          orderNumber: r.orderNumber,
          installmentNumber: r.installmentNumber ?? 0,
          amount: r.amount ?? 0,
          dueDate,
          daysOverdue,
          status: r.status
        }
      })
    })
    .exhaustive()
}

// ---------------------------------------------------------------------------
// Internal — Sorting
// ---------------------------------------------------------------------------

function applySorting(rows: ReportRow[], sortBy: string | undefined, sortDirection: string | undefined): ReportRow[] {
  if (!sortBy) return rows

  const dir = sortDirection === 'desc' ? -1 : 1

  return [...rows].sort((a, b) => {
    const aVal = a[sortBy]
    const bVal = b[sortBy]

    if (aVal === null || aVal === undefined) return dir
    if (bVal === null || bVal === undefined) return -dir

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * dir
    }

    return String(aVal).localeCompare(String(bVal)) * dir
  })
}

// ---------------------------------------------------------------------------
// Internal — Grouping
// ---------------------------------------------------------------------------

function buildGroups(rows: ReportRow[], groupBy: string): ReportGroup[] {
  const groupMap = new Map<string, ReportRow[]>()

  for (const row of rows) {
    const key = String(row[groupBy] ?? 'Outros')
    const existing = groupMap.get(key)
    if (existing) {
      existing.push(row)
    } else {
      groupMap.set(key, [row])
    }
  }

  const groups: ReportGroup[] = []

  for (const [key, groupRows] of groupMap) {
    const subtotal = groupRows.reduce((acc, r) => {
      const amount = findAmountValue(r)
      return acc + amount
    }, 0)

    groups.push({
      groupKey: key,
      groupLabel: key,
      subtotal,
      count: groupRows.length,
      rows: groupRows
    })
  }

  return groups
}

// ---------------------------------------------------------------------------
// Internal — Summary
// ---------------------------------------------------------------------------

function computeSummary(rows: ReportRow[], _template: ReportTemplateDefinition): ReportSummary {
  const totalCount = rows.length

  const totalAmount = rows.reduce((acc, r) => {
    return acc + findAmountValue(r)
  }, 0)

  const averageAmount = totalCount > 0 ? totalAmount / totalCount : 0

  return {
    totalAmount,
    totalCount,
    averageAmount
  }
}

/**
 * Extracts the primary monetary value from a report row.
 * Looks for common amount field names in priority order.
 */
function findAmountValue(row: ReportRow): number {
  const candidates = ['totalAmount', 'amount', 'totalValue', 'subtotal']
  for (const key of candidates) {
    const val = row[key]
    if (typeof val === 'number') return val
  }
  return 0
}

// ---------------------------------------------------------------------------
// Internal — CSV Formatting
// ---------------------------------------------------------------------------

function formatCsvValue(value: string | number | null | undefined, col: ReportColumnDefinition): string {
  if (value === null || value === undefined) return ''

  return match(col.type)
    .with('currency', () => {
      const num = typeof value === 'number' ? value : Number(value)
      if (Number.isNaN(num)) return String(value)
      return num.toFixed(2).replace('.', ',')
    })
    .with('number', () => String(value))
    .with('date', () => String(value))
    .with('string', () => {
      const str = String(value)
      // Escape CSV values containing semicolons or quotes
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    })
    .exhaustive()
}

// ---------------------------------------------------------------------------
// Internal — PDF Formatting
// ---------------------------------------------------------------------------

function formatPdfValue(value: string | number | null | undefined, col: ReportColumnDefinition): string {
  if (value === null || value === undefined) return '-'

  return match(col.type)
    .with('currency', () => {
      const num = typeof value === 'number' ? value : Number(value)
      if (Number.isNaN(num)) return String(value)
      return `R$ ${num.toFixed(2).replace('.', ',')}`
    })
    .with('number', () => String(value))
    .with('date', () => String(value))
    .with('string', () => String(value))
    .exhaustive()
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

// ---------------------------------------------------------------------------
// Internal — File Path Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the base data directory for exports.
 * Uses Electron's userData path in production, or a configurable override for testing.
 */
function getDataDir(): string {
  return app.getPath('userData')
}

/**
 * Builds the structured directory path for report exports.
 * Pattern: {userData}/{companyId}/exports/{reportType}/{year}/{month}
 */
function getExportDir(companyId: number, reportType: string, year: string, month: string): string {
  return join(getDataDir(), String(companyId), 'exports', reportType, year, month)
}
