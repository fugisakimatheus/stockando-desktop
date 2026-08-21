/**
 * Typed API client helpers for commercial endpoints (customers, suppliers,
 * purchase orders, sales orders, and payments).
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Shared types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

interface Pagination {
  limit: number
  offset: number
}

interface PaginatedResult<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

// ---------------------------------------------------------------------------
// Customer types
// ---------------------------------------------------------------------------

interface Customer {
  id: number
  companyId: number
  name: string
  documentNumber: string | null
  email: string | null
  phone: string | null
  address: string | null
  customerType: string
  status: string
  createdAt: string
  updatedAt: string
}

interface CustomerListItem {
  id: number
  name: string
  documentNumber: string | null
  email: string | null
  phone: string | null
  status: string
}

interface CustomerDetail extends Customer {
  quoteCount: number
  salesOrderCount: number
}

interface CustomerListFilters extends Pagination {
  search?: string
  status?: string
}

interface CreateCustomerInput {
  name: string
  documentNumber?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  customerType?: 'individual' | 'business'
}

interface UpdateCustomerInput {
  name?: string
  documentNumber?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  status?: 'active' | 'inactive'
}

// ---------------------------------------------------------------------------
// Supplier types
// ---------------------------------------------------------------------------

interface Supplier {
  id: number
  companyId: number
  name: string
  documentNumber: string
  tradeName: string | null
  email: string | null
  phone: string | null
  address: string | null
  status: string
  createdAt: string
  updatedAt: string
}

interface SupplierListItem {
  id: number
  name: string
  documentNumber: string
  tradeName: string | null
  email: string | null
  status: string
}

interface SupplierDetail extends Supplier {
  purchaseOrderCount: number
}

interface SupplierListFilters extends Pagination {
  search?: string
  status?: string
}

interface CreateSupplierInput {
  name: string
  documentNumber: string
  tradeName?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
}

interface UpdateSupplierInput {
  name?: string
  tradeName?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  status?: 'active' | 'inactive'
}

// ---------------------------------------------------------------------------
// Purchase Order types
// ---------------------------------------------------------------------------

const PURCHASE_ORDER_STATUSES = {
  draft: 'draft',
  sent: 'sent',
  partially_received: 'partially_received',
  received: 'received',
  cancelled: 'cancelled'
} as const

type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[keyof typeof PURCHASE_ORDER_STATUSES]

const PAYMENT_STATUSES = {
  unpaid: 'unpaid',
  partially_paid: 'partially_paid',
  paid: 'paid'
} as const

type PaymentStatus = (typeof PAYMENT_STATUSES)[keyof typeof PAYMENT_STATUSES]

interface PurchaseOrder {
  id: number
  companyId: number
  supplierId: number
  orderNumber: string
  status: PurchaseOrderStatus
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  expectedDeliveryDate: string | null
  paymentStatus: PaymentStatus
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

interface PurchaseOrderListItem {
  id: number
  orderNumber: string
  supplierName: string
  status: PurchaseOrderStatus
  totalAmount: number
  paymentStatus: PaymentStatus
  expectedDeliveryDate: string | null
  createdAt: string
}

interface PurchaseOrderDetailItem {
  id: number
  purchaseOrderId: number
  productId: number
  productName: string
  productSku: string
  quantity: number
  unitCost: number
  receivedQuantity: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  createdAt: string
}

interface PurchaseOrderPayment {
  id: number
  purchaseOrderId: number
  paymentMethodId: number
  amount: number
  status: string
  transactionReference: string | null
  paidAt: string
  createdAt: string
}

interface PurchaseOrderDetail extends PurchaseOrder {
  supplierName: string
  items: PurchaseOrderDetailItem[]
  payments: PurchaseOrderPayment[]
  totalPaid: number
  remainingBalance: number
}

interface PurchaseOrderListFilters extends Pagination {
  supplierId?: number
  status?: PurchaseOrderStatus
  paymentStatus?: PaymentStatus
  search?: string
}

interface PurchaseOrderItemInput {
  productId: number
  quantity: number
  unitCost: number
  discountAmount?: number
}

interface CreatePurchaseOrderInput {
  supplierId: number
  expectedDeliveryDate?: string | null
  items: PurchaseOrderItemInput[]
}

interface UpdatePurchaseOrderInput {
  supplierId?: number
  expectedDeliveryDate?: string | null
  items?: PurchaseOrderItemInput[]
}

interface ReceiptItemInput {
  purchaseOrderItemId: number
  receivedQuantity: number
  warehouseId: number
}

interface ReceiptInput {
  items: ReceiptItemInput[]
  notes?: string
}

// ---------------------------------------------------------------------------
// Sales Order types
// ---------------------------------------------------------------------------

type SalesOrderStatus = 'draft' | 'confirmed' | 'partially_fulfilled' | 'fulfilled' | 'cancelled'

interface SalesOrder {
  id: number
  companyId: number
  customerId: number | null
  orderNumber: string
  orderType: string
  status: SalesOrderStatus
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  paymentStatus: PaymentStatus
  confirmedAt: string | null
  fulfilledAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

interface SalesOrderListItem {
  id: number
  orderNumber: string
  customerName: string | null
  status: SalesOrderStatus
  totalAmount: number
  paymentStatus: PaymentStatus
  createdAt: string
}

interface SalesOrderDetailItem {
  id: number
  productId: number
  productName: string
  productSku: string
  quantity: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  createdAt: string
}

interface SalesOrderPaymentRecord {
  id: number
  paymentMethodId: number
  amount: number
  status: string
  transactionReference: string | null
  paidAt: string | null
  createdAt: string
}

interface SalesOrderDetail {
  id: number
  companyId: number
  customerId: number | null
  customerName: string | null
  orderNumber: string
  orderType: string
  status: SalesOrderStatus
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  paymentStatus: PaymentStatus
  confirmedAt: string | null
  fulfilledAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  items: SalesOrderDetailItem[]
  payments: SalesOrderPaymentRecord[]
  totalPaid: number
  remainingBalance: number
}

interface SalesOrderListFilters extends Pagination {
  customerId?: number
  status?: SalesOrderStatus
  paymentStatus?: PaymentStatus
  search?: string
}

interface OrderItemInput {
  productId: number
  quantity: number
  unitPrice: number
  discountAmount?: number
}

interface CreateSalesOrderInput {
  customerId: number
  items: OrderItemInput[]
}

interface UpdateSalesOrderInput {
  customerId?: number
  items?: OrderItemInput[]
}

// ---------------------------------------------------------------------------
// Payment types
// ---------------------------------------------------------------------------

interface RegisterPaymentInput {
  paymentMethodId: number
  amount: number
  transactionReference?: string | null
  paidAt: string
}

interface PaymentRecord {
  id: number
  paymentMethodId: number
  amount: number
  status: string
  transactionReference: string | null
  paidAt: string | null
  createdAt: string
}

interface PaymentSummary {
  payments: PaymentRecord[]
  documentTotal: number
  totalPaid: number
  remainingBalance: number
  paymentStatus: PaymentStatus
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

function buildQueryString<T extends object>(params: T): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }

  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

// ---------------------------------------------------------------------------
// Customers API
// ---------------------------------------------------------------------------

function listCustomers(companyId: number, filters: CustomerListFilters): Promise<PaginatedResult<CustomerListItem>> {
  const query = buildQueryString(filters)
  return apiClient<PaginatedResult<CustomerListItem>>(`/customers${query}`, {
    headers: companyHeaders(companyId)
  })
}

function getCustomer(companyId: number, id: number): Promise<CustomerDetail> {
  return apiClient<CustomerDetail>(`/customers/${id}`, {
    headers: companyHeaders(companyId)
  })
}

function createCustomer(companyId: number, input: CreateCustomerInput): Promise<Customer> {
  return apiClient<Customer>('/customers', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function updateCustomer(companyId: number, id: number, input: UpdateCustomerInput): Promise<Customer> {
  return apiClient<Customer>(`/customers/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function deleteCustomer(companyId: number, id: number): Promise<void> {
  return apiClient<void>(`/customers/${id}`, {
    method: 'DELETE',
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Suppliers API
// ---------------------------------------------------------------------------

function listSuppliers(companyId: number, filters: SupplierListFilters): Promise<PaginatedResult<SupplierListItem>> {
  const query = buildQueryString(filters)
  return apiClient<PaginatedResult<SupplierListItem>>(`/suppliers${query}`, {
    headers: companyHeaders(companyId)
  })
}

function getSupplier(companyId: number, id: number): Promise<SupplierDetail> {
  return apiClient<SupplierDetail>(`/suppliers/${id}`, {
    headers: companyHeaders(companyId)
  })
}

function createSupplier(companyId: number, input: CreateSupplierInput): Promise<Supplier> {
  return apiClient<Supplier>('/suppliers', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function updateSupplier(companyId: number, id: number, input: UpdateSupplierInput): Promise<Supplier> {
  return apiClient<Supplier>(`/suppliers/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function deleteSupplier(companyId: number, id: number): Promise<void> {
  return apiClient<void>(`/suppliers/${id}`, {
    method: 'DELETE',
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Purchase Orders API
// ---------------------------------------------------------------------------

function listPurchaseOrders(
  companyId: number,
  filters: PurchaseOrderListFilters
): Promise<PaginatedResult<PurchaseOrderListItem>> {
  const query = buildQueryString(filters)
  return apiClient<PaginatedResult<PurchaseOrderListItem>>(`/purchase-orders${query}`, {
    headers: companyHeaders(companyId)
  })
}

function getPurchaseOrder(companyId: number, id: number): Promise<PurchaseOrderDetail> {
  return apiClient<PurchaseOrderDetail>(`/purchase-orders/${id}`, {
    headers: companyHeaders(companyId)
  })
}

function createPurchaseOrder(companyId: number, input: CreatePurchaseOrderInput): Promise<PurchaseOrderDetail> {
  return apiClient<PurchaseOrderDetail>('/purchase-orders', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function updatePurchaseOrder(
  companyId: number,
  id: number,
  input: UpdatePurchaseOrderInput
): Promise<PurchaseOrderDetail> {
  return apiClient<PurchaseOrderDetail>(`/purchase-orders/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function transitionPurchaseOrderStatus(
  companyId: number,
  id: number,
  status: PurchaseOrderStatus
): Promise<PurchaseOrder> {
  return apiClient<PurchaseOrder>(`/purchase-orders/${id}/status`, {
    method: 'PATCH',
    body: { status },
    headers: companyHeaders(companyId)
  })
}

function recordPurchaseOrderReceipt(companyId: number, id: number, input: ReceiptInput): Promise<PurchaseOrderDetail> {
  return apiClient<PurchaseOrderDetail>(`/purchase-orders/${id}/receive`, {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Sales Orders API
// ---------------------------------------------------------------------------

function listSalesOrders(
  companyId: number,
  filters: SalesOrderListFilters
): Promise<PaginatedResult<SalesOrderListItem>> {
  const query = buildQueryString(filters)
  return apiClient<PaginatedResult<SalesOrderListItem>>(`/sales-orders${query}`, {
    headers: companyHeaders(companyId)
  })
}

function getSalesOrder(companyId: number, id: number): Promise<SalesOrderDetail> {
  return apiClient<SalesOrderDetail>(`/sales-orders/${id}`, {
    headers: companyHeaders(companyId)
  })
}

function createSalesOrder(companyId: number, input: CreateSalesOrderInput): Promise<SalesOrderDetail> {
  return apiClient<SalesOrderDetail>('/sales-orders', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function updateSalesOrder(companyId: number, id: number, input: UpdateSalesOrderInput): Promise<SalesOrderDetail> {
  return apiClient<SalesOrderDetail>(`/sales-orders/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function transitionSalesOrderStatus(companyId: number, id: number, status: SalesOrderStatus): Promise<SalesOrder> {
  return apiClient<SalesOrder>(`/sales-orders/${id}/status`, {
    method: 'PATCH',
    body: { status },
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Payments API
// ---------------------------------------------------------------------------

function listSalesOrderPayments(companyId: number, orderId: number): Promise<PaymentSummary> {
  return apiClient<PaymentSummary>(`/sales-orders/${orderId}/payments`, {
    headers: companyHeaders(companyId)
  })
}

function registerSalesOrderPayment(
  companyId: number,
  orderId: number,
  input: RegisterPaymentInput
): Promise<PaymentRecord> {
  return apiClient<PaymentRecord>(`/sales-orders/${orderId}/payments`, {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function listPurchaseOrderPayments(companyId: number, purchaseOrderId: number): Promise<PaymentSummary> {
  return apiClient<PaymentSummary>(`/purchase-orders/${purchaseOrderId}/payments`, {
    headers: companyHeaders(companyId)
  })
}

function registerPurchaseOrderPayment(
  companyId: number,
  purchaseOrderId: number,
  input: RegisterPaymentInput
): Promise<PaymentRecord> {
  return apiClient<PaymentRecord>(`/purchase-orders/${purchaseOrderId}/payments`, {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Customers
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  // Suppliers
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  // Purchase Orders
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  transitionPurchaseOrderStatus,
  recordPurchaseOrderReceipt,
  // Sales Orders
  listSalesOrders,
  getSalesOrder,
  createSalesOrder,
  updateSalesOrder,
  transitionSalesOrderStatus,
  // Payments
  listSalesOrderPayments,
  registerSalesOrderPayment,
  listPurchaseOrderPayments,
  registerPurchaseOrderPayment,
  // Constants
  PURCHASE_ORDER_STATUSES,
  PAYMENT_STATUSES
}

export type {
  // Shared
  Pagination as CommercialPagination,
  PaginatedResult as CommercialPaginatedResult,
  // Customers
  Customer,
  CustomerListItem,
  CustomerDetail,
  CustomerListFilters,
  CreateCustomerInput,
  UpdateCustomerInput,
  // Suppliers
  Supplier,
  SupplierListItem,
  SupplierDetail,
  SupplierListFilters,
  CreateSupplierInput,
  UpdateSupplierInput,
  // Purchase Orders
  PurchaseOrderStatus,
  PaymentStatus,
  PurchaseOrder,
  PurchaseOrderListItem,
  PurchaseOrderDetailItem,
  PurchaseOrderPayment,
  PurchaseOrderDetail,
  PurchaseOrderListFilters,
  PurchaseOrderItemInput,
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ReceiptItemInput,
  ReceiptInput,
  // Sales Orders
  SalesOrder,
  SalesOrderListItem,
  SalesOrderDetailItem,
  SalesOrderPaymentRecord,
  SalesOrderDetail,
  SalesOrderListFilters,
  SalesOrderStatus,
  OrderItemInput,
  CreateSalesOrderInput,
  UpdateSalesOrderInput,
  // Payments
  RegisterPaymentInput,
  PaymentRecord,
  PaymentSummary
}
