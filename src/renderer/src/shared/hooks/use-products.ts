import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from '@shared/api'
import type {
  CreateProductInput,
  PaginatedResult,
  Product,
  ProductDetail,
  ProductListFilters,
  ProductListItem,
  UpdateProductInput
} from '@shared/api'
import { createPaginatedQueryHooks } from '@shared/lib'

// ---------------------------------------------------------------------------
// Generated hooks via factory
// ---------------------------------------------------------------------------

const {
  keys: productKeys,
  useList: useProducts,
  useDetail: useProductDetail,
  useCreate: useCreateProduct,
  useUpdate: useUpdateProduct,
  useDelete: useDeleteProduct
} = createPaginatedQueryHooks<
  ProductListItem,
  ProductDetail,
  ProductListFilters,
  CreateProductInput,
  UpdateProductInput
>({
  domain: 'products',
  list: (companyId, filters) => listProducts(companyId, filters),
  detail: (companyId, id) => getProduct(companyId, id),
  create: (companyId, input) => createProduct(companyId, input),
  update: (companyId, id, data) => updateProduct(companyId, id, data),
  delete: (companyId, id) => deleteProduct(companyId, id)
})

export { productKeys, useCreateProduct, useDeleteProduct, useProductDetail, useProducts, useUpdateProduct }
export type {
  CreateProductInput,
  PaginatedResult,
  Product,
  ProductDetail,
  ProductListFilters,
  ProductListItem,
  UpdateProductInput
}
