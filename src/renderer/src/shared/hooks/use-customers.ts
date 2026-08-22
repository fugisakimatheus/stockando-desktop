import { createCustomer, deleteCustomer, getCustomer, listCustomers, updateCustomer } from '@shared/api'
import type {
  CreateCustomerInput,
  Customer,
  CustomerDetail,
  CustomerListFilters,
  CustomerListItem,
  PaginatedResult,
  UpdateCustomerInput
} from '@shared/api'
import { createPaginatedQueryHooks } from '@shared/lib'

// ---------------------------------------------------------------------------
// Generated hooks via factory
// ---------------------------------------------------------------------------

const {
  keys: customerKeys,
  useList: useCustomers,
  useDetail: useCustomerDetail,
  useCreate: useCreateCustomer,
  useUpdate: useUpdateCustomer,
  useDelete: useDeleteCustomer
} = createPaginatedQueryHooks<
  CustomerListItem,
  CustomerDetail,
  CustomerListFilters,
  CreateCustomerInput,
  UpdateCustomerInput
>({
  domain: 'customers',
  list: (companyId, filters) => listCustomers(companyId, filters),
  detail: (companyId, id) => getCustomer(companyId, id),
  create: (companyId, input) => createCustomer(companyId, input),
  update: (companyId, id, data) => updateCustomer(companyId, id, data),
  delete: (companyId, id) => deleteCustomer(companyId, id)
})

export { customerKeys, useCreateCustomer, useCustomerDetail, useCustomers, useDeleteCustomer, useUpdateCustomer }
export type {
  CreateCustomerInput,
  Customer,
  CustomerDetail,
  CustomerListFilters,
  CustomerListItem,
  PaginatedResult,
  UpdateCustomerInput
}
