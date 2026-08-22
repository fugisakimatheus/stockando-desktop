import { createSupplier, deleteSupplier, getSupplier, listSuppliers, updateSupplier } from '@shared/api'
import type {
  CreateSupplierInput,
  PaginatedResult,
  Supplier,
  SupplierDetail,
  SupplierListFilters,
  SupplierListItem,
  UpdateSupplierInput
} from '@shared/api'
import { createPaginatedQueryHooks } from '@shared/lib'

// ---------------------------------------------------------------------------
// Generated hooks via factory
// ---------------------------------------------------------------------------

const {
  keys: supplierKeys,
  useList: useSuppliers,
  useDetail: useSupplierDetail,
  useCreate: useCreateSupplier,
  useUpdate: useUpdateSupplier,
  useDelete: useDeleteSupplier
} = createPaginatedQueryHooks<
  SupplierListItem,
  SupplierDetail,
  SupplierListFilters,
  CreateSupplierInput,
  UpdateSupplierInput
>({
  domain: 'suppliers',
  list: (companyId, filters) => listSuppliers(companyId, filters),
  detail: (companyId, id) => getSupplier(companyId, id),
  create: (companyId, input) => createSupplier(companyId, input),
  update: (companyId, id, data) => updateSupplier(companyId, id, data),
  delete: (companyId, id) => deleteSupplier(companyId, id)
})

export { supplierKeys, useCreateSupplier, useDeleteSupplier, useSupplierDetail, useSuppliers, useUpdateSupplier }
export type {
  CreateSupplierInput,
  PaginatedResult,
  Supplier,
  SupplierDetail,
  SupplierListFilters,
  SupplierListItem,
  UpdateSupplierInput
}
