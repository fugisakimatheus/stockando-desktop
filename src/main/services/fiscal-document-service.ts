/**
 * FiscalDocumentService — manages fiscal document (NF-e / NFC-e) lifecycle.
 *
 * Provides:
 * - `create(companyId, input)` — create a fiscal document from a Sales_Order within a transaction
 * - `authorize(companyId, id, input)` — record authorization with access key, protocol, and XML storage
 * - `cancel(companyId, id, input)` — record cancellation with protocol and justification
 *
 * All queries enforce company scoping. Document operations execute atomically
 * within a single SQLite transaction for consistency.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 11.1, 11.2, 11.4, 11.5, 15.2, 15.3
 */

import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

import { and, count, desc, eq, gte, like, lte, ne, or } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'

import {
  BusinessRuleError,
  DuplicateFiscalDocumentError,
  FiscalDocumentNotAuthorizedError,
  NotFoundError
} from '../api/errors'
import {
  attachments,
  customers,
  invoiceEvents,
  invoiceItems,
  invoices,
  orderItems,
  orders,
  products
} from '../db/schema'
import type * as schema from '../db/schema'
import { getDb } from '../server'
import type {
  AttachmentRecord,
  AuthorizeFiscalInput,
  CancelFiscalInput,
  CreateFiscalDocumentInput,
  FiscalDocumentDetail,
  FiscalDocumentEvent,
  FiscalDocumentItem,
  FiscalDocumentListFilters,
  FiscalDocumentListItem,
  FiscalDocumentStatus,
  FiscalDocumentType,
  PaginatedResult
} from '../types/finance'
import { log } from './audit-service'
import { getNextNumber } from './document-series-service'
import { getFiscalFilePathFromDate } from './fiscal-file-path'
import { assertFiscalTransition, assertValidAccessKey } from './fiscal-transitions'

// ---------------------------------------------------------------------------
// Transaction type alias
// ---------------------------------------------------------------------------

type DrizzleTx = BetterSQLite3Database<typeof schema>

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ORDER_STATUSES_FOR_FISCAL = ['confirmed', 'partially_fulfilled', 'fulfilled'] as const

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a fiscal document (NF-e or NFC-e) from a Sales_Order.
 *
 * Validates:
 * - Sales_Order exists, belongs to company, and is in a valid status
 * - No active (non-cancelled) fiscal document of same type exists for the order
 * - Computed total matches the order Document_Total
 *
 * Within a single transaction:
 * 1. Validates order status
 * 2. Checks for duplicate fiscal documents
 * 3. Gets next document number from DocumentSeriesService
 * 4. Loads order items
 * 5. Computes totals and validates against order total
 * 6. Inserts the invoice record
 * 7. Copies order items as invoice_items
 * 8. Records an audit log entry
 * 9. Returns the full FiscalDocumentDetail
 */
export async function create(companyId: number, input: CreateFiscalDocumentInput): Promise<FiscalDocumentDetail> {
  const db = getDb()

  return db.transaction(async (tx) => {
    // 1. Validate Sales_Order exists, belongs to company, is in valid status
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.companyId, companyId)))

    if (!order) {
      throw new NotFoundError(`Sales order with id ${input.orderId} not found`)
    }

    if (!VALID_ORDER_STATUSES_FOR_FISCAL.includes(order.status as (typeof VALID_ORDER_STATUSES_FOR_FISCAL)[number])) {
      throw new BusinessRuleError(
        `Sales order must be in one of [${VALID_ORDER_STATUSES_FOR_FISCAL.join(', ')}] status to create a fiscal document. Current status: "${order.status}"`
      )
    }

    // 2. Check no active (non-cancelled) fiscal document of same type exists for this order
    const [existingDoc] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          eq(invoices.orderId, input.orderId),
          eq(invoices.documentType, input.documentType),
          ne(invoices.status, 'cancelled')
        )
      )

    if (existingDoc) {
      throw new DuplicateFiscalDocumentError(
        `An active fiscal document of type "${input.documentType}" already exists for order ${input.orderId}`
      )
    }

    // 3. Get next document number from DocumentSeriesService within transaction
    const documentNumber = await getNextNumber(tx, companyId, input.documentType, input.series)

    // 4. Load order items
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, input.orderId))

    // 5. Compute totals from items
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const discountAmount = items.reduce((sum, item) => sum + item.discountAmount, 0)
    const taxAmount = items.reduce((sum, item) => sum + item.taxAmount, 0)
    const totalAmount = subtotal - discountAmount + taxAmount

    // Validate computed total matches order Document_Total (Requirement 11.1, 11.2)
    if (Math.abs(totalAmount - order.totalAmount) > 0.01) {
      throw new BusinessRuleError(
        `Computed fiscal document total (${totalAmount}) does not match order total (${order.totalAmount})`
      )
    }

    // 6. Insert invoice record with status "draft"
    const now = new Date().toISOString()

    const [invoice] = await tx
      .insert(invoices)
      .values({
        companyId,
        orderId: input.orderId,
        customerId: order.customerId,
        digitalCertificateId: input.digitalCertificateId ?? null,
        taxRuleId: input.taxRuleId ?? null,
        documentType: input.documentType,
        documentNumber: String(documentNumber),
        series: input.series,
        issueDate: input.issueDate,
        status: 'draft',
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        createdAt: now,
        updatedAt: now
      })
      .returning()

    // 7. Copy order items as invoice_items
    for (const item of items) {
      await tx.insert(invoiceItems).values({
        invoiceId: invoice.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxAmount: item.taxAmount,
        totalAmount: item.totalAmount,
        createdAt: now
      })
    }

    // 8. Record audit log entry
    await log(tx, {
      companyId,
      entityType: 'fiscal_document',
      entityId: String(invoice.id),
      action: 'created',
      details: JSON.stringify({
        documentType: input.documentType,
        documentNumber: String(documentNumber),
        series: input.series,
        orderId: input.orderId,
        totalAmount
      })
    })

    // 9. Build and return FiscalDocumentDetail
    return buildDetail(tx, companyId, invoice.id)
  })
}

/**
 * Records the authorization of a fiscal document (NF-e or NFC-e).
 *
 * Validates:
 * - Document exists and belongs to company
 * - Current status is "draft" (transition to "authorized" is valid)
 * - Access key follows the 44-digit numeric format
 *
 * Within a single transaction:
 * 1. Validates document status via assertFiscalTransition
 * 2. Validates access key format via assertValidAccessKey
 * 3. Updates invoice: status, accessKey, protocolNumber, authorizedAt
 * 4. Creates an invoice_event with type "authorized"
 * 5. Stores the authorization XML as an attachment on the filesystem
 * 6. Records an audit log entry
 * 7. Returns the full FiscalDocumentDetail
 *
 * Requirements: 5.1, 5.4, 5.5, 5.6, 6.1, 11.4, 15.3
 */
export async function authorize(
  companyId: number,
  id: number,
  input: AuthorizeFiscalInput
): Promise<FiscalDocumentDetail> {
  const db = getDb()

  return db.transaction(async (tx) => {
    // 1. Load the invoice by id + companyId
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))

    if (!invoice) {
      throw new NotFoundError(`Fiscal document with id ${id} not found`)
    }

    // 2. Validate status transition: draft → authorized
    assertFiscalTransition(invoice.status as FiscalDocumentStatus, 'authorized')

    // 3. Validate access key format (44 digits)
    assertValidAccessKey(input.accessKey)

    // 4. Update invoice record
    const now = new Date().toISOString()

    await tx
      .update(invoices)
      .set({
        status: 'authorized',
        accessKey: input.accessKey,
        protocolNumber: input.protocolNumber,
        authorizedAt: input.authorizedAt,
        updatedAt: now
      })
      .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))

    // 5. Create invoice_event
    await tx.insert(invoiceEvents).values({
      invoiceId: id,
      eventType: 'authorized',
      protocolNumber: input.protocolNumber,
      eventDate: input.authorizedAt,
      createdAt: now
    })

    // 6. Store XML as attachment on filesystem
    const xmlFileName = `${invoice.documentType.toLowerCase().replace('-', '')}-${invoice.documentNumber}.xml`
    const xmlRelativePath = getFiscalFilePathFromDate({
      companyId,
      issueDate: invoice.issueDate,
      documentType: invoice.documentType as FiscalDocumentType,
      documentNumber: invoice.documentNumber,
      fileName: xmlFileName
    })
    const absolutePath = join(getDataDir(), xmlRelativePath)
    await fs.mkdir(dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, input.xmlContent, 'utf-8')

    // Insert attachment record
    await tx.insert(attachments).values({
      companyId,
      entityType: 'fiscal_document',
      entityId: String(id),
      fileName: xmlFileName,
      filePath: xmlRelativePath,
      mimeType: 'text/xml',
      fileSize: Buffer.byteLength(input.xmlContent),
      createdAt: now
    })

    // 7. Record audit log
    await log(tx, {
      companyId,
      entityType: 'fiscal_document',
      entityId: String(id),
      action: 'status_change:draft→authorized',
      details: JSON.stringify({
        accessKey: input.accessKey,
        protocolNumber: input.protocolNumber,
        authorizedAt: input.authorizedAt
      })
    })

    // 8. Return the full detail
    return buildDetail(tx, companyId, id)
  })
}

/**
 * Records the cancellation of an authorized fiscal document (NF-e or NFC-e).
 *
 * Validates:
 * - Document exists and belongs to company
 * - Current status is "authorized" (transition to "cancelled" is valid)
 *
 * Within a single transaction:
 * 1. Validates document status via assertFiscalTransition
 * 2. Updates invoice: status, protocolNumber, cancelledAt, cancellationJustification
 * 3. Creates an invoice_event with type "cancelled"
 * 4. Records an audit log entry
 * 5. Returns the full FiscalDocumentDetail
 *
 * Note: Original document data (items, subtotal, taxAmount, XML) is preserved unchanged.
 *
 * Requirements: 5.2, 5.3, 5.6, 5.7, 11.5, 15.3
 */
export async function cancel(companyId: number, id: number, input: CancelFiscalInput): Promise<FiscalDocumentDetail> {
  const db = getDb()

  return db.transaction(async (tx) => {
    // 1. Load the invoice by id + companyId
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))

    if (!invoice) {
      throw new NotFoundError(`Fiscal document with id ${id} not found`)
    }

    // 2. Validate status transition: authorized → cancelled
    assertFiscalTransition(invoice.status as FiscalDocumentStatus, 'cancelled')

    // 3. Update invoice record (preserve original data unchanged)
    const now = new Date().toISOString()

    await tx
      .update(invoices)
      .set({
        status: 'cancelled',
        protocolNumber: input.protocolNumber,
        cancelledAt: input.cancelledAt,
        cancellationJustification: input.justification,
        updatedAt: now
      })
      .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))

    // 4. Create invoice_event
    await tx.insert(invoiceEvents).values({
      invoiceId: id,
      eventType: 'cancelled',
      protocolNumber: input.protocolNumber,
      justification: input.justification,
      eventDate: input.cancelledAt,
      createdAt: now
    })

    // 5. Record audit log
    await log(tx, {
      companyId,
      entityType: 'fiscal_document',
      entityId: String(id),
      action: 'status_change:authorized→cancelled',
      details: JSON.stringify({
        protocolNumber: input.protocolNumber,
        justification: input.justification,
        cancelledAt: input.cancelledAt
      })
    })

    // 6. Return the full detail
    return buildDetail(tx, companyId, id)
  })
}

/**
 * Returns a paginated list of fiscal documents for the company.
 *
 * Supports filters:
 * - documentType (NF-e or NFC-e)
 * - status (draft, authorized, cancelled, denied)
 * - startDate / endDate (issueDate inclusive range)
 * - customerId
 * - search (LIKE on document number or customer name)
 *
 * Results are ordered by issueDate DESC, id DESC.
 *
 * Requirements: 7.1, 7.4, 7.5, 12.1
 */
export async function list(
  companyId: number,
  filters: FiscalDocumentListFilters
): Promise<PaginatedResult<FiscalDocumentListItem>> {
  const db = getDb()

  const limit = filters.limit || 20
  const offset = filters.offset || 0

  const conditions = [eq(invoices.companyId, companyId)]

  if (filters.documentType) {
    conditions.push(eq(invoices.documentType, filters.documentType))
  }

  if (filters.status) {
    conditions.push(eq(invoices.status, filters.status))
  }

  if (filters.customerId !== undefined) {
    conditions.push(eq(invoices.customerId, filters.customerId))
  }

  if (filters.startDate) {
    conditions.push(gte(invoices.issueDate, filters.startDate))
  }

  if (filters.endDate) {
    conditions.push(lte(invoices.issueDate, filters.endDate))
  }

  if (filters.search) {
    const searchPattern = `%${filters.search}%`
    const searchCondition = or(like(invoices.documentNumber, searchPattern), like(customers.name, searchPattern))
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereClause = and(...conditions)

  // Count total matching records (with left join for customer search)
  const [countResult] = await db
    .select({ total: count() })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(whereClause)

  const total = countResult?.total ?? 0

  // Fetch paginated rows
  const rows = await db
    .select({
      id: invoices.id,
      documentType: invoices.documentType,
      documentNumber: invoices.documentNumber,
      series: invoices.series,
      accessKey: invoices.accessKey,
      customerName: customers.name,
      status: invoices.status,
      totalAmount: invoices.totalAmount,
      issueDate: invoices.issueDate,
      createdAt: invoices.createdAt
    })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(whereClause)
    .orderBy(desc(invoices.issueDate), desc(invoices.id))
    .limit(limit)
    .offset(offset)

  const data: FiscalDocumentListItem[] = rows.map((row) => ({
    id: row.id,
    documentType: row.documentType as FiscalDocumentType,
    documentNumber: row.documentNumber,
    series: row.series ?? '',
    accessKey: row.accessKey,
    customerName: row.customerName ?? null,
    status: row.status as FiscalDocumentStatus,
    totalAmount: row.totalAmount,
    issueDate: row.issueDate,
    createdAt: row.createdAt
  }))

  return { data, total, limit, offset }
}

/**
 * Returns the full detail of a fiscal document including items, events,
 * customer name, and order reference.
 *
 * Throws NotFoundError if the document does not exist or does not belong to the company.
 *
 * Requirements: 7.2, 12.1
 */
export async function detail(companyId: number, id: number): Promise<FiscalDocumentDetail> {
  const db = getDb()
  return buildDetail(db, companyId, id)
}

/**
 * Searches for a fiscal document by exact access key within the company scope.
 *
 * Returns the full FiscalDocumentDetail if found, or null if no match exists.
 *
 * Requirements: 7.3, 12.1
 */
export async function searchByAccessKey(companyId: number, accessKey: string): Promise<FiscalDocumentDetail | null> {
  const db = getDb()

  const [invoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), eq(invoices.accessKey, accessKey)))

  if (!invoice) {
    return null
  }

  return buildDetail(db, companyId, invoice.id)
}

// ---------------------------------------------------------------------------
// DANFE and XML access
// ---------------------------------------------------------------------------

/**
 * Generates a DANFE (PDF representation) for an authorized fiscal document.
 *
 * Validates:
 * - Invoice exists and belongs to the company
 * - Invoice status is "authorized"
 *
 * Generates a placeholder PDF (actual integration with @nfewizard/danfe is deferred),
 * stores it as an attachment using the fiscal file path structure, and returns
 * the attachment record.
 *
 * Requirements: 6.1, 6.2, 6.5, 6.6
 */
export async function generateDanfe(companyId: number, id: number): Promise<AttachmentRecord> {
  const db = getDb()

  // 1. Load invoice
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))

  if (!invoice) {
    throw new NotFoundError(`Fiscal document with id ${id} not found`)
  }

  // 2. Validate status is "authorized"
  if (invoice.status !== 'authorized') {
    throw new FiscalDocumentNotAuthorizedError('Fiscal document must be in authorized status to generate DANFE')
  }

  // 3. Generate placeholder PDF content
  const pdfContent = Buffer.from(`DANFE PDF placeholder for document ${invoice.documentNumber}`)

  // 4. Compute fiscal file path
  const fileName = `danfe-${invoice.documentNumber}.pdf`
  const relativePath = getFiscalFilePathFromDate({
    companyId,
    issueDate: invoice.issueDate,
    documentType: invoice.documentType as FiscalDocumentType,
    documentNumber: invoice.documentNumber,
    fileName
  })

  // 5. Write file to filesystem
  const absolutePath = join(getDataDir(), relativePath)
  await fs.mkdir(dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, pdfContent)

  // 6. Insert attachment record
  const now = new Date().toISOString()

  const [attachment] = await db
    .insert(attachments)
    .values({
      companyId,
      entityType: 'fiscal_document',
      entityId: String(id),
      fileName,
      filePath: relativePath,
      mimeType: 'application/pdf',
      fileSize: pdfContent.length,
      createdAt: now
    })
    .returning()

  return {
    id: attachment.id,
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    fileName: attachment.fileName,
    filePath: attachment.filePath,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    createdAt: attachment.createdAt
  }
}

/**
 * Retrieves the stored XML content for a fiscal document.
 *
 * Looks up the XML attachment associated with the fiscal document and reads
 * the file content from the filesystem.
 *
 * Requirements: 6.3
 */
export async function getXml(companyId: number, id: number): Promise<string> {
  const db = getDb()

  // 1. Validate invoice exists and belongs to company
  const [invoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))

  if (!invoice) {
    throw new NotFoundError(`Fiscal document with id ${id} not found`)
  }

  // 2. Find XML attachment
  const [xmlAttachment] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.companyId, companyId),
        eq(attachments.entityType, 'fiscal_document'),
        eq(attachments.entityId, String(id)),
        like(attachments.fileName, '%.xml')
      )
    )

  if (!xmlAttachment) {
    throw new NotFoundError('XML not found for this fiscal document')
  }

  // 3. Read file content from filesystem
  const absolutePath = join(getDataDir(), xmlAttachment.filePath)
  const content = await fs.readFile(absolutePath, 'utf-8')

  return content
}

/**
 * Retrieves the stored DANFE file path for a fiscal document.
 *
 * Returns the absolute filesystem path to the DANFE PDF attachment.
 *
 * Requirements: 6.4
 */
export async function getDanfePath(companyId: number, id: number): Promise<string> {
  const db = getDb()

  // 1. Validate invoice exists and belongs to company
  const [invoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))

  if (!invoice) {
    throw new NotFoundError(`Fiscal document with id ${id} not found`)
  }

  // 2. Find DANFE attachment
  const [danfeAttachment] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.companyId, companyId),
        eq(attachments.entityType, 'fiscal_document'),
        eq(attachments.entityId, String(id)),
        like(attachments.fileName, '%.pdf')
      )
    )

  if (!danfeAttachment) {
    throw new NotFoundError('DANFE not found for this fiscal document')
  }

  // 3. Return absolute file path
  return join(getDataDir(), danfeAttachment.filePath)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a complete FiscalDocumentDetail from within a transaction context.
 * Fetches the invoice, its items (with product info), events, customer name,
 * and order number.
 */
async function buildDetail(tx: DrizzleTx, companyId: number, invoiceId: number): Promise<FiscalDocumentDetail> {
  // Load invoice
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))

  if (!invoice) {
    throw new NotFoundError(`Fiscal document with id ${invoiceId} not found`)
  }

  // Load customer name
  let customerName: string | null = null
  if (invoice.customerId) {
    const [customer] = await tx
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, invoice.customerId))

    customerName = customer?.name ?? null
  }

  // Load order number
  let orderNumber: string | null = null
  if (invoice.orderId) {
    const [order] = await tx
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, invoice.orderId))

    orderNumber = order?.orderNumber ?? null
  }

  // Load invoice items with product info
  const itemRows = await tx
    .select({
      id: invoiceItems.id,
      productId: invoiceItems.productId,
      productName: products.name,
      productSku: products.sku,
      quantity: invoiceItems.quantity,
      unitPrice: invoiceItems.unitPrice,
      taxAmount: invoiceItems.taxAmount,
      totalAmount: invoiceItems.totalAmount
    })
    .from(invoiceItems)
    .innerJoin(products, eq(invoiceItems.productId, products.id))
    .where(eq(invoiceItems.invoiceId, invoiceId))

  const detailItems: FiscalDocumentItem[] = itemRows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount
  }))

  // Load invoice events
  const eventRows = await tx.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoiceId))

  const events: FiscalDocumentEvent[] = eventRows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    protocolNumber: row.protocolNumber,
    justification: row.justification,
    eventDate: row.eventDate,
    createdAt: row.createdAt
  }))

  return {
    id: invoice.id,
    companyId: invoice.companyId,
    orderId: invoice.orderId,
    customerId: invoice.customerId,
    customerName,
    digitalCertificateId: invoice.digitalCertificateId,
    taxRuleId: invoice.taxRuleId,
    documentType: invoice.documentType as FiscalDocumentType,
    documentNumber: invoice.documentNumber,
    series: invoice.series ?? '',
    accessKey: invoice.accessKey,
    protocolNumber: invoice.protocolNumber,
    issueDate: invoice.issueDate,
    status: invoice.status as FiscalDocumentStatus,
    subtotal: invoice.subtotal,
    discountAmount: invoice.discountAmount,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    authorizedAt: invoice.authorizedAt,
    cancelledAt: invoice.cancelledAt,
    cancellationJustification: invoice.cancellationJustification,
    items: detailItems,
    events,
    orderNumber
  }
}

/**
 * Returns the base data directory for file storage.
 * Uses Electron's userData path.
 */
function getDataDir(): string {
  return app.getPath('userData')
}
