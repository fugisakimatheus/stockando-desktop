/**
 * Static report template definitions for all 9 business reports.
 *
 * Each template describes the columns, filters, and grouping options available
 * for a given report type. Templates are versioned with the application — no
 * database migration required.
 */

import type { ReportTemplateDefinition, ReportTemplateId } from '../types/phase4-types'
import { REPORT_TEMPLATE_IDS } from '../types/phase4-types'

// ---------------------------------------------------------------------------
// Template Definitions
// ---------------------------------------------------------------------------

const salesByPeriod = {
  id: REPORT_TEMPLATE_IDS.sales_by_period,
  name: 'Vendas por Período',
  description: 'Vendas agregadas por período de tempo (dia, semana ou mês).',
  availableFilters: [{ key: 'dateRange', label: 'Período', type: 'date_range' }],
  availableGroupings: ['day', 'week', 'month'],
  columns: [
    { key: 'date', label: 'Data', type: 'date', sortable: true },
    { key: 'orderCount', label: 'Qtd. Pedidos', type: 'number', sortable: true },
    { key: 'totalAmount', label: 'Valor Total', type: 'currency', sortable: true },
    { key: 'averageAmount', label: 'Valor Médio', type: 'currency', sortable: true }
  ]
} satisfies ReportTemplateDefinition

const salesByProduct = {
  id: REPORT_TEMPLATE_IDS.sales_by_product,
  name: 'Vendas por Produto',
  description: 'Detalhamento de vendas por produto com quantidade e valores.',
  availableFilters: [
    { key: 'dateRange', label: 'Período', type: 'date_range' },
    { key: 'categoryId', label: 'Categoria', type: 'category_select' }
  ],
  availableGroupings: ['category'],
  columns: [
    { key: 'productName', label: 'Produto', type: 'string', sortable: true },
    { key: 'sku', label: 'SKU', type: 'string', sortable: true },
    { key: 'quantitySold', label: 'Qtd. Vendida', type: 'number', sortable: true },
    { key: 'totalAmount', label: 'Valor Total', type: 'currency', sortable: true },
    { key: 'averagePrice', label: 'Preço Médio', type: 'currency', sortable: true }
  ]
} satisfies ReportTemplateDefinition

const salesByCustomer = {
  id: REPORT_TEMPLATE_IDS.sales_by_customer,
  name: 'Vendas por Cliente',
  description: 'Detalhamento de vendas por cliente com totais e médias.',
  availableFilters: [
    { key: 'dateRange', label: 'Período', type: 'date_range' },
    { key: 'customerId', label: 'Cliente', type: 'entity_select' }
  ],
  availableGroupings: ['customerType'],
  columns: [
    { key: 'customerName', label: 'Cliente', type: 'string', sortable: true },
    { key: 'documentNumber', label: 'CPF/CNPJ', type: 'string', sortable: true },
    { key: 'orderCount', label: 'Qtd. Pedidos', type: 'number', sortable: true },
    { key: 'totalAmount', label: 'Valor Total', type: 'currency', sortable: true },
    { key: 'averageAmount', label: 'Valor Médio', type: 'currency', sortable: true }
  ]
} satisfies ReportTemplateDefinition

const purchasesByPeriod = {
  id: REPORT_TEMPLATE_IDS.purchases_by_period,
  name: 'Compras por Período',
  description: 'Compras agregadas por período de tempo (dia, semana ou mês).',
  availableFilters: [{ key: 'dateRange', label: 'Período', type: 'date_range' }],
  availableGroupings: ['day', 'week', 'month'],
  columns: [
    { key: 'date', label: 'Data', type: 'date', sortable: true },
    { key: 'orderCount', label: 'Qtd. Pedidos', type: 'number', sortable: true },
    { key: 'totalAmount', label: 'Valor Total', type: 'currency', sortable: true },
    { key: 'averageAmount', label: 'Valor Médio', type: 'currency', sortable: true }
  ]
} satisfies ReportTemplateDefinition

const purchasesBySupplier = {
  id: REPORT_TEMPLATE_IDS.purchases_by_supplier,
  name: 'Compras por Fornecedor',
  description: 'Detalhamento de compras por fornecedor com totais e médias.',
  availableFilters: [
    { key: 'dateRange', label: 'Período', type: 'date_range' },
    { key: 'supplierId', label: 'Fornecedor', type: 'entity_select' }
  ],
  availableGroupings: [],
  columns: [
    { key: 'supplierName', label: 'Fornecedor', type: 'string', sortable: true },
    { key: 'documentNumber', label: 'CPF/CNPJ', type: 'string', sortable: true },
    { key: 'orderCount', label: 'Qtd. Pedidos', type: 'number', sortable: true },
    { key: 'totalAmount', label: 'Valor Total', type: 'currency', sortable: true },
    { key: 'averageAmount', label: 'Valor Médio', type: 'currency', sortable: true }
  ]
} satisfies ReportTemplateDefinition

const inventoryMovements = {
  id: REPORT_TEMPLATE_IDS.inventory_movements,
  name: 'Movimentações de Estoque',
  description: 'Histórico de movimentações de estoque por produto e depósito.',
  availableFilters: [
    { key: 'dateRange', label: 'Período', type: 'date_range' },
    { key: 'productId', label: 'Produto', type: 'entity_select' },
    { key: 'movementType', label: 'Tipo de Movimentação', type: 'status_select' }
  ],
  availableGroupings: ['product', 'warehouse', 'movementType'],
  columns: [
    { key: 'date', label: 'Data', type: 'date', sortable: true },
    { key: 'productName', label: 'Produto', type: 'string', sortable: true },
    { key: 'warehouseName', label: 'Depósito', type: 'string', sortable: true },
    { key: 'movementType', label: 'Tipo', type: 'string', sortable: true },
    { key: 'quantity', label: 'Quantidade', type: 'number', sortable: true },
    { key: 'unitCost', label: 'Custo Unitário', type: 'currency', sortable: true }
  ]
} satisfies ReportTemplateDefinition

const stockLevels = {
  id: REPORT_TEMPLATE_IDS.stock_levels,
  name: 'Níveis de Estoque',
  description: 'Posições atuais de estoque por produto e depósito.',
  availableFilters: [
    { key: 'categoryId', label: 'Categoria', type: 'category_select' },
    { key: 'warehouseId', label: 'Depósito', type: 'entity_select' }
  ],
  availableGroupings: ['warehouse', 'category'],
  columns: [
    { key: 'productName', label: 'Produto', type: 'string', sortable: true },
    { key: 'sku', label: 'SKU', type: 'string', sortable: true },
    { key: 'warehouseName', label: 'Depósito', type: 'string', sortable: true },
    { key: 'quantity', label: 'Quantidade', type: 'number', sortable: true },
    { key: 'reservedQuantity', label: 'Reservada', type: 'number', sortable: true },
    { key: 'unitCost', label: 'Custo Unitário', type: 'currency', sortable: true },
    { key: 'totalValue', label: 'Valor Total', type: 'currency', sortable: true }
  ]
} satisfies ReportTemplateDefinition

const receivablesAging = {
  id: REPORT_TEMPLATE_IDS.receivables_aging,
  name: 'Contas a Receber (Aging)',
  description: 'Análise de vencimento das parcelas a receber por cliente.',
  availableFilters: [
    { key: 'dateRange', label: 'Período', type: 'date_range' },
    { key: 'customerId', label: 'Cliente', type: 'entity_select' },
    { key: 'status', label: 'Status', type: 'status_select' }
  ],
  availableGroupings: ['customer', 'agingBucket'],
  columns: [
    { key: 'customerName', label: 'Cliente', type: 'string', sortable: true },
    { key: 'orderNumber', label: 'Nº Pedido', type: 'string', sortable: true },
    { key: 'installmentNumber', label: 'Parcela', type: 'number', sortable: true },
    { key: 'amount', label: 'Valor', type: 'currency', sortable: true },
    { key: 'dueDate', label: 'Vencimento', type: 'date', sortable: true },
    { key: 'daysOverdue', label: 'Dias em Atraso', type: 'number', sortable: true },
    { key: 'status', label: 'Status', type: 'string', sortable: true }
  ]
} satisfies ReportTemplateDefinition

const payablesAging = {
  id: REPORT_TEMPLATE_IDS.payables_aging,
  name: 'Contas a Pagar (Aging)',
  description: 'Análise de vencimento das parcelas a pagar por fornecedor.',
  availableFilters: [
    { key: 'dateRange', label: 'Período', type: 'date_range' },
    { key: 'supplierId', label: 'Fornecedor', type: 'entity_select' },
    { key: 'status', label: 'Status', type: 'status_select' }
  ],
  availableGroupings: ['supplier', 'agingBucket'],
  columns: [
    { key: 'supplierName', label: 'Fornecedor', type: 'string', sortable: true },
    { key: 'orderNumber', label: 'Nº Pedido', type: 'string', sortable: true },
    { key: 'installmentNumber', label: 'Parcela', type: 'number', sortable: true },
    { key: 'amount', label: 'Valor', type: 'currency', sortable: true },
    { key: 'dueDate', label: 'Vencimento', type: 'date', sortable: true },
    { key: 'daysOverdue', label: 'Dias em Atraso', type: 'number', sortable: true },
    { key: 'status', label: 'Status', type: 'string', sortable: true }
  ]
} satisfies ReportTemplateDefinition

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const REPORT_TEMPLATES: readonly ReportTemplateDefinition[] = [
  salesByPeriod,
  salesByProduct,
  salesByCustomer,
  purchasesByPeriod,
  purchasesBySupplier,
  inventoryMovements,
  stockLevels,
  receivablesAging,
  payablesAging
] as const

function getReportTemplate(id: ReportTemplateId): ReportTemplateDefinition | undefined {
  return REPORT_TEMPLATES.find((t) => t.id === id)
}

export { REPORT_TEMPLATES, getReportTemplate }
