import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// App-level settings (not scoped to a company)
// ---------------------------------------------------------------------------

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const companies = sqliteTable(
  'companies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    documentNumber: text('document_number').notNull(),
    tradeName: text('trade_name'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('companies_document_number_unique').on(t.documentNumber),
    index('companies_status_idx').on(t.status)
  ]
)

export const companySettings = sqliteTable('company_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' })
    .unique(),
  companyName: text('company_name').notNull(),
  taxRegime: text('tax_regime'),
  currencyCode: text('currency_code').notNull().default('BRL'),
  fiscalEnvironment: text('fiscal_environment').notNull().default('production'),
  invoiceSeries: text('invoice_series'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    role: text('role').notNull().default('admin'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('users_company_email_unique').on(t.companyId, t.email),
    index('users_company_idx').on(t.companyId),
    index('users_role_idx').on(t.role)
  ]
)

export const roles = sqliteTable(
  'roles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [uniqueIndex('roles_company_name_unique').on(t.companyId, t.name), index('roles_company_idx').on(t.companyId)]
)

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
    createdAt: text('created_at').notNull()
  },
  (t) => [uniqueIndex('role_permissions_role_permission_unique').on(t.roleId, t.permission)]
)

export const customers = sqliteTable(
  'customers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    documentNumber: text('document_number'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    customerType: text('customer_type').notNull().default('individual'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('customers_company_document_unique').on(t.companyId, t.documentNumber),
    index('customers_company_idx').on(t.companyId)
  ]
)

export const suppliers = sqliteTable(
  'suppliers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    documentNumber: text('document_number').notNull(),
    tradeName: text('trade_name'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('suppliers_company_document_unique').on(t.companyId, t.documentNumber),
    index('suppliers_company_idx').on(t.companyId),
    index('suppliers_status_idx').on(t.status)
  ]
)

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    parentCategoryId: integer('parent_category_id').references(() => categories.id, {
      onDelete: 'set null'
    }),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('categories_company_name_unique').on(t.companyId, t.name),
    index('categories_parent_category_idx').on(t.parentCategoryId)
  ]
)

export const unitsOfMeasure = sqliteTable(
  'units_of_measure',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    symbol: text('symbol').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [uniqueIndex('units_company_name_unique').on(t.companyId, t.name)]
)

export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    unitId: integer('unit_id').references(() => unitsOfMeasure.id, { onDelete: 'set null' }),
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
  },
  (t) => [
    uniqueIndex('products_company_sku_unique').on(t.companyId, t.sku),
    index('products_company_idx').on(t.companyId),
    index('products_category_idx').on(t.categoryId),
    index('products_status_idx').on(t.status)
  ]
)

export const warehouses = sqliteTable(
  'warehouses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    address: text('address'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('warehouses_company_code_unique').on(t.companyId, t.code),
    index('warehouses_company_idx').on(t.companyId)
  ]
)

export const stock = sqliteTable(
  'stock',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    warehouseId: integer('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),
    quantity: real('quantity').notNull().default(0),
    reservedQuantity: real('reserved_quantity').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('stock_company_product_warehouse_unique').on(t.companyId, t.productId, t.warehouseId),
    index('stock_product_idx').on(t.productId),
    index('stock_warehouse_idx').on(t.warehouseId)
  ]
)

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    warehouseId: integer('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),
    movementType: text('movement_type').notNull(),
    quantity: real('quantity').notNull(),
    unitCost: real('unit_cost'),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    notes: text('notes'),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('stock_movements_company_idx').on(t.companyId),
    index('stock_movements_product_idx').on(t.productId),
    index('stock_movements_warehouse_idx').on(t.warehouseId),
    index('stock_movements_company_product_idx').on(t.companyId, t.productId),
    index('stock_movements_company_warehouse_idx').on(t.companyId, t.warehouseId)
  ]
)

export const stockAdjustments = sqliteTable(
  'stock_adjustments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    warehouseId: integer('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),
    adjustmentType: text('adjustment_type').notNull(),
    quantity: real('quantity').notNull(),
    unitCost: real('unit_cost'),
    reason: text('reason'),
    notes: text('notes'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('stock_adjustments_company_idx').on(t.companyId),
    index('stock_adjustments_product_idx').on(t.productId),
    index('stock_adjustments_warehouse_idx').on(t.warehouseId)
  ]
)

export const paymentMethods = sqliteTable(
  'payment_methods',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [uniqueIndex('payment_methods_company_code_unique').on(t.companyId, t.code)]
)

export const taxRules = sqliteTable(
  'tax_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    taxType: text('tax_type').notNull(),
    rate: real('rate').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [uniqueIndex('tax_rules_company_name_unique').on(t.companyId, t.name)]
)

export const digitalCertificates = sqliteTable(
  'digital_certificates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    issuerName: text('issuer_name'),
    serialNumber: text('serial_number'),
    validFrom: text('valid_from'),
    validTo: text('valid_to'),
    status: text('status').notNull().default('active'),
    certificatePath: text('certificate_path'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [uniqueIndex('digital_certificates_company_alias_unique').on(t.companyId, t.alias)]
)

export const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    orderNumber: text('order_number').notNull(),
    orderType: text('order_type').notNull().default('sale'),
    status: text('status').notNull().default('draft'),
    subtotal: real('subtotal').notNull().default(0),
    discountAmount: real('discount_amount').notNull().default(0),
    taxAmount: real('tax_amount').notNull().default(0),
    totalAmount: real('total_amount').notNull().default(0),
    paymentStatus: text('payment_status').notNull().default('pending'),
    confirmedAt: text('confirmed_at'),
    fulfilledAt: text('fulfilled_at'),
    cancelledAt: text('cancelled_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('orders_company_order_number_unique').on(t.companyId, t.orderNumber),
    index('orders_company_idx').on(t.companyId),
    index('orders_status_idx').on(t.status)
  ]
)

export const quotes = sqliteTable(
  'quotes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    quoteNumber: text('quote_number').notNull(),
    status: text('status').notNull().default('draft'),
    validUntil: text('valid_until'),
    subtotal: real('subtotal').notNull().default(0),
    discountAmount: real('discount_amount').notNull().default(0),
    taxAmount: real('tax_amount').notNull().default(0),
    totalAmount: real('total_amount').notNull().default(0),
    notes: text('notes'),
    cancelledAt: text('cancelled_at'),
    convertedAt: text('converted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('quotes_company_quote_number_unique').on(t.companyId, t.quoteNumber),
    index('quotes_company_idx').on(t.companyId),
    index('quotes_customer_idx').on(t.customerId),
    index('quotes_status_idx').on(t.status)
  ]
)

export const quoteItems = sqliteTable(
  'quote_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    quoteId: integer('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: real('quantity').notNull(),
    unitPrice: real('unit_price').notNull(),
    discountAmount: real('discount_amount').notNull().default(0),
    taxAmount: real('tax_amount').notNull().default(0),
    totalAmount: real('total_amount').notNull(),
    createdAt: text('created_at').notNull()
  },
  (t) => [index('quote_items_quote_idx').on(t.quoteId), index('quote_items_product_idx').on(t.productId)]
)

export const quoteOrderConversions = sqliteTable(
  'quote_order_conversions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    quoteId: integer('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    convertedAt: text('converted_at').notNull(),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    uniqueIndex('quote_order_conversions_quote_unique').on(t.quoteId),
    uniqueIndex('quote_order_conversions_order_unique').on(t.orderId),
    index('quote_order_conversions_quote_idx').on(t.quoteId),
    index('quote_order_conversions_order_idx').on(t.orderId)
  ]
)

export const orderItems = sqliteTable(
  'order_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: real('quantity').notNull(),
    unitPrice: real('unit_price').notNull(),
    discountAmount: real('discount_amount').notNull().default(0),
    taxAmount: real('tax_amount').notNull().default(0),
    totalAmount: real('total_amount').notNull(),
    createdAt: text('created_at').notNull()
  },
  (t) => [index('order_items_order_idx').on(t.orderId), index('order_items_product_idx').on(t.productId)]
)

export const orderPayments = sqliteTable(
  'order_payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    paymentMethodId: integer('payment_method_id')
      .notNull()
      .references(() => paymentMethods.id, { onDelete: 'restrict' }),
    amount: real('amount').notNull(),
    status: text('status').notNull().default('pending'),
    transactionReference: text('transaction_reference'),
    paidAt: text('paid_at'),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('order_payments_order_idx').on(t.orderId),
    index('order_payments_payment_method_idx').on(t.paymentMethodId)
  ]
)

export const purchaseOrders = sqliteTable(
  'purchase_orders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    supplierId: integer('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    orderNumber: text('order_number').notNull(),
    status: text('status').notNull().default('draft'),
    subtotal: real('subtotal').notNull().default(0),
    discountAmount: real('discount_amount').notNull().default(0),
    taxAmount: real('tax_amount').notNull().default(0),
    totalAmount: real('total_amount').notNull().default(0),
    expectedDeliveryDate: text('expected_delivery_date'),
    paymentStatus: text('payment_status').notNull().default('pending'),
    cancelledAt: text('cancelled_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('purchase_orders_company_order_unique').on(t.companyId, t.orderNumber),
    index('purchase_orders_company_idx').on(t.companyId),
    index('purchase_orders_supplier_idx').on(t.supplierId),
    index('purchase_orders_status_idx').on(t.status)
  ]
)

export const purchaseOrderItems = sqliteTable(
  'purchase_order_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    purchaseOrderId: integer('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: real('quantity').notNull(),
    receivedQuantity: real('received_quantity').notNull().default(0),
    unitCost: real('unit_cost').notNull(),
    discountAmount: real('discount_amount').notNull().default(0),
    taxAmount: real('tax_amount').notNull().default(0),
    totalAmount: real('total_amount').notNull(),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('purchase_order_items_purchase_order_idx').on(t.purchaseOrderId),
    index('purchase_order_items_product_idx').on(t.productId)
  ]
)

export const purchaseOrderPayments = sqliteTable(
  'purchase_order_payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    purchaseOrderId: integer('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    paymentMethodId: integer('payment_method_id')
      .notNull()
      .references(() => paymentMethods.id, { onDelete: 'restrict' }),
    amount: real('amount').notNull(),
    status: text('status').notNull().default('pending'),
    transactionReference: text('transaction_reference'),
    paidAt: text('paid_at'),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('purchase_order_payments_purchase_order_idx').on(t.purchaseOrderId),
    index('purchase_order_payments_payment_method_idx').on(t.paymentMethodId)
  ]
)

export const priceRules = sqliteTable(
  'price_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ruleType: text('rule_type').notNull(),
    appliesToType: text('applies_to_type').notNull(),
    appliesToId: text('applies_to_id'),
    value: real('value').notNull(),
    startDate: text('start_date'),
    endDate: text('end_date'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [index('price_rules_company_idx').on(t.companyId), index('price_rules_status_idx').on(t.status)]
)

export const invoices = sqliteTable(
  'invoices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
    customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    digitalCertificateId: integer('digital_certificate_id').references(() => digitalCertificates.id, {
      onDelete: 'set null'
    }),
    taxRuleId: integer('tax_rule_id').references(() => taxRules.id, { onDelete: 'set null' }),
    documentType: text('document_type').notNull(),
    documentNumber: text('document_number').notNull(),
    series: text('series'),
    accessKey: text('access_key'),
    protocolNumber: text('protocol_number'),
    issueDate: text('issue_date').notNull(),
    status: text('status').notNull().default('draft'),
    subtotal: real('subtotal').notNull().default(0),
    discountAmount: real('discount_amount').notNull().default(0),
    taxAmount: real('tax_amount').notNull().default(0),
    totalAmount: real('total_amount').notNull().default(0),
    authorizedAt: text('authorized_at'),
    cancelledAt: text('cancelled_at'),
    cancellationJustification: text('cancellation_justification'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('invoices_company_document_unique').on(t.companyId, t.documentType, t.documentNumber),
    index('invoices_company_idx').on(t.companyId),
    index('invoices_status_idx').on(t.status),
    index('invoices_company_status_date_idx').on(t.companyId, t.status, t.issueDate)
  ]
)

export const invoiceItems = sqliteTable(
  'invoice_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: real('quantity').notNull(),
    unitPrice: real('unit_price').notNull(),
    taxAmount: real('tax_amount').notNull().default(0),
    totalAmount: real('total_amount').notNull(),
    createdAt: text('created_at').notNull()
  },
  (t) => [index('invoice_items_invoice_idx').on(t.invoiceId), index('invoice_items_product_idx').on(t.productId)]
)

export const financialAccounts = sqliteTable(
  'financial_accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    accountType: text('account_type').notNull(),
    bankName: text('bank_name'),
    initialBalance: real('initial_balance').notNull().default(0),
    currentBalance: real('current_balance').notNull().default(0),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [index('financial_accounts_company_idx').on(t.companyId), index('financial_accounts_status_idx').on(t.status)]
)

export const financialTransactions = sqliteTable(
  'financial_transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    accountId: integer('account_id')
      .notNull()
      .references(() => financialAccounts.id, { onDelete: 'cascade' }),
    transactionType: text('transaction_type').notNull(),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    amount: real('amount').notNull(),
    description: text('description'),
    transactionDate: text('transaction_date').notNull(),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('financial_transactions_company_idx').on(t.companyId),
    index('financial_transactions_account_idx').on(t.accountId),
    index('financial_transactions_date_idx').on(t.transactionDate),
    index('financial_transactions_account_date_idx').on(t.accountId, t.transactionDate)
  ]
)

export const documentSeries = sqliteTable(
  'document_series',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    documentType: text('document_type').notNull(),
    series: text('series').notNull(),
    currentNumber: integer('current_number').notNull().default(0),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [uniqueIndex('document_series_company_type_series_unique').on(t.companyId, t.documentType, t.series)]
)

export const numberingSequences = sqliteTable(
  'numbering_sequences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sequenceType: text('sequence_type').notNull(),
    currentValue: integer('current_value').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [uniqueIndex('numbering_sequences_company_type_unique').on(t.companyId, t.sequenceType)]
)

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    details: text('details'),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('audit_logs_company_idx').on(t.companyId),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_user_idx').on(t.userId),
    index('audit_logs_entity_date_idx').on(t.entityType, t.entityId, t.createdAt)
  ]
)

export const attachments = sqliteTable(
  'attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    fileName: text('file_name').notNull(),
    filePath: text('file_path').notNull(),
    mimeType: text('mime_type'),
    fileSize: integer('file_size'),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('attachments_company_idx').on(t.companyId),
    index('attachments_entity_idx').on(t.entityType, t.entityId)
  ]
)

// ---------------------------------------------------------------------------
// Phase 3 tables
// ---------------------------------------------------------------------------

export const installments = sqliteTable(
  'installments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: integer('order_id').notNull(),
    orderType: text('order_type').notNull(),
    installmentNumber: integer('installment_number').notNull(),
    amount: real('amount').notNull(),
    dueDate: text('due_date').notNull(),
    status: text('status').notNull().default('pending'),
    settledAt: text('settled_at'),
    accountId: integer('account_id').references(() => financialAccounts.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    index('installments_company_order_idx').on(t.companyId, t.orderId, t.orderType),
    index('installments_company_status_idx').on(t.companyId, t.status),
    index('installments_company_type_status_idx').on(t.companyId, t.orderType, t.status)
  ]
)

export const invoiceEvents = sqliteTable(
  'invoice_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    protocolNumber: text('protocol_number'),
    justification: text('justification'),
    eventDate: text('event_date').notNull(),
    createdAt: text('created_at').notNull()
  },
  (t) => [index('invoice_events_invoice_idx').on(t.invoiceId)]
)

// ---------------------------------------------------------------------------
// Phase 4 tables
// ---------------------------------------------------------------------------

export const dashboardAggregates = sqliteTable(
  'dashboard_aggregates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    periodKey: text('period_key').notNull(),
    metricName: text('metric_name').notNull(),
    value: real('value').notNull(),
    computedAt: text('computed_at').notNull()
  },
  (t) => [
    uniqueIndex('dashboard_aggregates_company_period_metric_unique').on(t.companyId, t.periodKey, t.metricName),
    index('dashboard_aggregates_company_idx').on(t.companyId)
  ]
)

export const automationRules = sqliteTable(
  'automation_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    triggerType: text('trigger_type').notNull(),
    triggerParams: text('trigger_params').notNull(),
    actionType: text('action_type').notNull(),
    actionParams: text('action_params').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastEvaluatedAt: text('last_evaluated_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    index('automation_rules_company_idx').on(t.companyId),
    index('automation_rules_company_enabled_idx').on(t.companyId, t.enabled)
  ]
)

export const ruleEvaluations = sqliteTable(
  'rule_evaluations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ruleId: integer('rule_id')
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    actionTaken: text('action_taken').notNull(),
    evaluatedAt: text('evaluated_at').notNull()
  },
  (t) => [
    uniqueIndex('rule_evaluations_rule_entity_unique').on(t.ruleId, t.entityType, t.entityId),
    index('rule_evaluations_rule_idx').on(t.ruleId)
  ]
)

export const reminders = sqliteTable(
  'reminders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    entitySummary: text('entity_summary').notNull().default(''),
    message: text('message').notNull(),
    dueDate: text('due_date').notNull(),
    status: text('status').notNull().default('active'),
    ruleId: integer('rule_id').references(() => automationRules.id, { onDelete: 'set null' }),
    dismissedAt: text('dismissed_at'),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    index('reminders_company_idx').on(t.companyId),
    index('reminders_company_status_idx').on(t.companyId, t.status),
    index('reminders_company_due_date_idx').on(t.companyId, t.dueDate),
    index('reminders_rule_idx').on(t.ruleId)
  ]
)

export const integrationConfigs = sqliteTable(
  'integration_configs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    providerType: text('provider_type').notNull(),
    endpointUrl: text('endpoint_url').notNull(),
    credentialsRef: text('credentials_ref'),
    description: text('description'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    lastTestedAt: text('last_tested_at'),
    lastTestResult: text('last_test_result'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [
    index('integration_configs_company_idx').on(t.companyId),
    index('integration_configs_company_provider_idx').on(t.companyId, t.providerType)
  ]
)

export const importJobs = sqliteTable(
  'import_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    fileName: text('file_name').notNull(),
    status: text('status').notNull().default('pending'),
    totalRows: integer('total_rows'),
    importedRows: integer('imported_rows'),
    skippedRows: integer('skipped_rows'),
    failedRows: integer('failed_rows'),
    errorDetails: text('error_details'),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('import_jobs_company_idx').on(t.companyId),
    index('import_jobs_company_status_idx').on(t.companyId, t.status)
  ]
)

// ---------------------------------------------------------------------------
// Phase 0 inferred types
// ---------------------------------------------------------------------------

export type Company = typeof companies.$inferSelect
export type CompanyInsert = typeof companies.$inferInsert

export type CompanySettings = typeof companySettings.$inferSelect
export type CompanySettingsInsert = typeof companySettings.$inferInsert

export type AppSetting = typeof appSettings.$inferSelect
export type AppSettingInsert = typeof appSettings.$inferInsert

export type User = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert

export type AuditLog = typeof auditLogs.$inferSelect
export type AuditLogInsert = typeof auditLogs.$inferInsert

// ---------------------------------------------------------------------------
// Phase 2 inferred types
// ---------------------------------------------------------------------------

export type Order = typeof orders.$inferSelect
export type OrderInsert = typeof orders.$inferInsert

export type OrderItem = typeof orderItems.$inferSelect
export type OrderItemInsert = typeof orderItems.$inferInsert

export type OrderPayment = typeof orderPayments.$inferSelect
export type OrderPaymentInsert = typeof orderPayments.$inferInsert

export type Quote = typeof quotes.$inferSelect
export type QuoteInsert = typeof quotes.$inferInsert

export type QuoteItem = typeof quoteItems.$inferSelect
export type QuoteItemInsert = typeof quoteItems.$inferInsert

export type QuoteOrderConversion = typeof quoteOrderConversions.$inferSelect
export type QuoteOrderConversionInsert = typeof quoteOrderConversions.$inferInsert

export type Customer = typeof customers.$inferSelect
export type CustomerInsert = typeof customers.$inferInsert

export type Supplier = typeof suppliers.$inferSelect
export type SupplierInsert = typeof suppliers.$inferInsert

export type PurchaseOrder = typeof purchaseOrders.$inferSelect
export type PurchaseOrderInsert = typeof purchaseOrders.$inferInsert

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect
export type PurchaseOrderItemInsert = typeof purchaseOrderItems.$inferInsert

export type PurchaseOrderPayment = typeof purchaseOrderPayments.$inferSelect
export type PurchaseOrderPaymentInsert = typeof purchaseOrderPayments.$inferInsert

// ---------------------------------------------------------------------------
// Phase 3 inferred types
// ---------------------------------------------------------------------------

export type Installment = typeof installments.$inferSelect
export type InstallmentInsert = typeof installments.$inferInsert

export type FinancialAccount = typeof financialAccounts.$inferSelect
export type FinancialAccountInsert = typeof financialAccounts.$inferInsert

export type FinancialTransaction = typeof financialTransactions.$inferSelect
export type FinancialTransactionInsert = typeof financialTransactions.$inferInsert

export type Invoice = typeof invoices.$inferSelect
export type InvoiceInsert = typeof invoices.$inferInsert

export type InvoiceItem = typeof invoiceItems.$inferSelect
export type InvoiceItemInsert = typeof invoiceItems.$inferInsert

export type DocumentSeriesRow = typeof documentSeries.$inferSelect
export type DocumentSeriesInsert = typeof documentSeries.$inferInsert

export type Attachment = typeof attachments.$inferSelect
export type AttachmentInsert = typeof attachments.$inferInsert

export type InvoiceEvent = typeof invoiceEvents.$inferSelect
export type InvoiceEventInsert = typeof invoiceEvents.$inferInsert

// ---------------------------------------------------------------------------
// Phase 4 inferred types
// ---------------------------------------------------------------------------

export type DashboardAggregate = typeof dashboardAggregates.$inferSelect
export type DashboardAggregateInsert = typeof dashboardAggregates.$inferInsert

export type AutomationRule = typeof automationRules.$inferSelect
export type AutomationRuleInsert = typeof automationRules.$inferInsert

export type RuleEvaluation = typeof ruleEvaluations.$inferSelect
export type RuleEvaluationInsert = typeof ruleEvaluations.$inferInsert

export type Reminder = typeof reminders.$inferSelect
export type ReminderInsert = typeof reminders.$inferInsert

export type IntegrationConfig = typeof integrationConfigs.$inferSelect
export type IntegrationConfigInsert = typeof integrationConfigs.$inferInsert

export type ImportJob = typeof importJobs.$inferSelect
export type ImportJobInsert = typeof importJobs.$inferInsert
