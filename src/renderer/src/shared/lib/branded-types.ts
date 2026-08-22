/**
 * Branded types for domain IDs.
 *
 * Prevents accidental mixing of plain `number` values across different
 * domain boundaries. A `CompanyId` cannot be passed where a `ProductId`
 * is expected, even though both are numbers at runtime.
 *
 * Uses the TypeScript "brand" pattern (a phantom property that exists
 * only at the type level, never at runtime).
 *
 * @example
 * ```ts
 * function useProducts(companyId: CompanyId, filters: ProductListFilters) { ... }
 *
 * const companyId = useCompanyId() // returns CompanyId
 * const productId = 42 as ProductId
 *
 * useProducts(companyId, filters) // ✅ OK
 * useProducts(productId, filters) // ❌ Type error: ProductId is not CompanyId
 * ```
 *
 * ## Adoption Strategy
 *
 * Branded types are opt-in. They can be introduced gradually:
 * 1. Start with `CompanyId` at the `useCompanyId()` hook boundary
 * 2. Extend to other domain IDs as pages are touched
 * 3. Existing `number` parameters continue to work with a cast
 *
 * The `brandId()` helper creates a branded value from a plain number.
 * Use it at system boundaries (API responses, route params, hook returns).
 */

// ---------------------------------------------------------------------------
// Brand utility
// ---------------------------------------------------------------------------

/**
 * Creates a branded numeric type. The brand exists only at the type level
 * and has zero runtime cost.
 */
type Brand<T, B extends string> = T & { readonly __brand: B }

/**
 * A branded numeric ID. Use specific aliases (CompanyId, ProductId, etc.)
 * instead of this generic type directly.
 */
type BrandedId<B extends string> = Brand<number, B>

/**
 * Casts a plain number to a branded ID type.
 * Use at system boundaries (API responses, route params).
 */
function brandId<B extends string>(value: number): BrandedId<B> {
  return value as BrandedId<B>
}

// ---------------------------------------------------------------------------
// Domain ID Types
// ---------------------------------------------------------------------------

/** Unique identifier for a company. */
type CompanyId = BrandedId<'CompanyId'>

/** Unique identifier for a product. */
type ProductId = BrandedId<'ProductId'>

/** Unique identifier for a category. */
type CategoryId = BrandedId<'CategoryId'>

/** Unique identifier for a unit of measure. */
type UnitId = BrandedId<'UnitId'>

/** Unique identifier for a warehouse. */
type WarehouseId = BrandedId<'WarehouseId'>

/** Unique identifier for a customer. */
type CustomerId = BrandedId<'CustomerId'>

/** Unique identifier for a supplier. */
type SupplierId = BrandedId<'SupplierId'>

/** Unique identifier for a sales order. */
type SalesOrderId = BrandedId<'SalesOrderId'>

/** Unique identifier for a purchase order. */
type PurchaseOrderId = BrandedId<'PurchaseOrderId'>

/** Unique identifier for a quote. */
type QuoteId = BrandedId<'QuoteId'>

/** Unique identifier for a fiscal document. */
type FiscalDocumentId = BrandedId<'FiscalDocumentId'>

/** Unique identifier for a stock movement. */
type StockMovementId = BrandedId<'StockMovementId'>

// ---------------------------------------------------------------------------
// Factory helpers for common domains
// ---------------------------------------------------------------------------

const CompanyId = (value: number): CompanyId => brandId<'CompanyId'>(value)
const ProductId = (value: number): ProductId => brandId<'ProductId'>(value)
const CategoryId = (value: number): CategoryId => brandId<'CategoryId'>(value)
const UnitId = (value: number): UnitId => brandId<'UnitId'>(value)
const WarehouseId = (value: number): WarehouseId => brandId<'WarehouseId'>(value)
const CustomerId = (value: number): CustomerId => brandId<'CustomerId'>(value)
const SupplierId = (value: number): SupplierId => brandId<'SupplierId'>(value)
const SalesOrderId = (value: number): SalesOrderId => brandId<'SalesOrderId'>(value)
const PurchaseOrderId = (value: number): PurchaseOrderId => brandId<'PurchaseOrderId'>(value)
const QuoteId = (value: number): QuoteId => brandId<'QuoteId'>(value)
const FiscalDocumentId = (value: number): FiscalDocumentId => brandId<'FiscalDocumentId'>(value)
const StockMovementId = (value: number): StockMovementId => brandId<'StockMovementId'>(value)

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  brandId,
  CategoryId,
  CompanyId,
  CustomerId,
  FiscalDocumentId,
  ProductId,
  PurchaseOrderId,
  QuoteId,
  SalesOrderId,
  StockMovementId,
  SupplierId,
  UnitId,
  WarehouseId
}

export type {
  Brand,
  BrandedId,
  CategoryId as CategoryIdType,
  CompanyId as CompanyIdType,
  CustomerId as CustomerIdType,
  FiscalDocumentId as FiscalDocumentIdType,
  ProductId as ProductIdType,
  PurchaseOrderId as PurchaseOrderIdType,
  QuoteId as QuoteIdType,
  SalesOrderId as SalesOrderIdType,
  StockMovementId as StockMovementIdType,
  SupplierId as SupplierIdType,
  UnitId as UnitIdType,
  WarehouseId as WarehouseIdType
}
