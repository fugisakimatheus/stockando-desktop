import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  documentNumber: text('document_number').notNull(),
  tradeName: text('trade_name'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const companySettings = sqliteTable('company_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  companyName: text('company_name').notNull(),
  taxRegime: text('tax_regime'),
  currencyCode: text('currency_code').notNull().default('BRL'),
  fiscalEnvironment: text('fiscal_environment').notNull().default('production'),
  invoiceSeries: text('invoice_series'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('admin'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  documentNumber: text('document_number'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  customerType: text('customer_type').notNull().default('individual'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  parentCategoryId: integer('parent_category_id').references(() => categories.id),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const unitsOfMeasure = sqliteTable('units_of_measure', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id),
  unitId: integer('unit_id').references(() => unitsOfMeasure.id),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  barcode: text('barcode'),
  costPrice: real('cost_price'),
  salePrice: real('sale_price'),
  trackInventory: integer('track_inventory', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const warehouses = sqliteTable('warehouses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  code: text('code').notNull(),
  address: text('address'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const stock = sqliteTable('stock', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  warehouseId: integer('warehouse_id')
    .notNull()
    .references(() => warehouses.id),
  quantity: real('quantity').notNull().default(0),
  reservedQuantity: real('reserved_quantity').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const stockMovements = sqliteTable('stock_movements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  warehouseId: integer('warehouse_id')
    .notNull()
    .references(() => warehouses.id),
  movementType: text('movement_type').notNull(),
  quantity: real('quantity').notNull(),
  unitCost: real('unit_cost'),
  referenceType: text('reference_type'),
  referenceId: text('reference_id'),
  notes: text('notes'),
  createdAt: text('created_at').notNull()
})

export const paymentMethods = sqliteTable('payment_methods', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  code: text('code').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const taxRules = sqliteTable('tax_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  taxType: text('tax_type').notNull(),
  rate: real('rate').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const digitalCertificates = sqliteTable('digital_certificates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  alias: text('alias').notNull(),
  issuerName: text('issuer_name'),
  serialNumber: text('serial_number'),
  validFrom: text('valid_from'),
  validTo: text('valid_to'),
  status: text('status').notNull().default('active'),
  certificatePath: text('certificate_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  customerId: integer('customer_id').references(() => customers.id),
  orderNumber: text('order_number').notNull().unique(),
  orderType: text('order_type').notNull().default('sale'),
  status: text('status').notNull().default('draft'),
  subtotal: real('subtotal').notNull().default(0),
  discountAmount: real('discount_amount').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  totalAmount: real('total_amount').notNull().default(0),
  paymentStatus: text('payment_status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  quantity: real('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  discountAmount: real('discount_amount').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  totalAmount: real('total_amount').notNull(),
  createdAt: text('created_at').notNull()
})

export const orderPayments = sqliteTable('order_payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id),
  paymentMethodId: integer('payment_method_id')
    .notNull()
    .references(() => paymentMethods.id),
  amount: real('amount').notNull(),
  status: text('status').notNull().default('pending'),
  transactionReference: text('transaction_reference'),
  paidAt: text('paid_at'),
  createdAt: text('created_at').notNull()
})

export const invoices = sqliteTable('invoices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  orderId: integer('order_id').references(() => orders.id),
  customerId: integer('customer_id').references(() => customers.id),
  digitalCertificateId: integer('digital_certificate_id').references(() => digitalCertificates.id),
  taxRuleId: integer('tax_rule_id').references(() => taxRules.id),
  documentType: text('document_type').notNull(),
  documentNumber: text('document_number').notNull(),
  accessKey: text('access_key'),
  issueDate: text('issue_date').notNull(),
  status: text('status').notNull().default('draft'),
  subtotal: real('subtotal').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  totalAmount: real('total_amount').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const invoiceItems = sqliteTable('invoice_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  invoiceId: integer('invoice_id')
    .notNull()
    .references(() => invoices.id),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  quantity: real('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  taxAmount: real('tax_amount').notNull().default(0),
  totalAmount: real('total_amount').notNull(),
  createdAt: text('created_at').notNull()
})

export const documentSeries = sqliteTable('document_series', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  documentType: text('document_type').notNull(),
  series: text('series').notNull(),
  currentNumber: integer('current_number').notNull().default(0),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const numberingSequences = sqliteTable('numbering_sequences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  sequenceType: text('sequence_type').notNull(),
  currentValue: integer('current_value').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})
