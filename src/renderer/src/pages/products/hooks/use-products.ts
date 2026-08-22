/**
 * Re-exports from shared hooks.
 *
 * Products hooks live in @shared/hooks because they are consumed by multiple
 * pages (products, sales-orders, purchase-orders, quotes).
 */
export {
  productKeys,
  useCreateProduct,
  useDeleteProduct,
  useProductDetail,
  useProducts,
  useUpdateProduct
} from '@shared/hooks/use-products'
export type {
  CreateProductInput,
  PaginatedResult,
  Product,
  ProductDetail,
  ProductListFilters,
  ProductListItem,
  UpdateProductInput
} from '@shared/hooks/use-products'
