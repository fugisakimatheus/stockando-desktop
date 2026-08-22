import { createWarehouse, deleteWarehouse, listWarehouses, updateWarehouse } from '@shared/api'
import type { CreateWarehouseInput, UpdateWarehouseInput, Warehouse } from '@shared/api'
import { createSimpleQueryHooks } from '@shared/lib'

// ---------------------------------------------------------------------------
// Generated hooks via factory
// ---------------------------------------------------------------------------

const {
  keys: warehouseKeys,
  useList: useWarehouses,
  useCreate: useCreateWarehouse,
  useUpdate: useUpdateWarehouse,
  useDelete: useDeleteWarehouse
} = createSimpleQueryHooks<Warehouse, CreateWarehouseInput, UpdateWarehouseInput>({
  domain: 'warehouses',
  list: (companyId) => listWarehouses(companyId),
  create: (companyId, input) => createWarehouse(companyId, input),
  update: (companyId, id, data) => updateWarehouse(companyId, id, data),
  delete: (companyId, id) => deleteWarehouse(companyId, id)
})

export { useCreateWarehouse, useDeleteWarehouse, useUpdateWarehouse, useWarehouses, warehouseKeys }
export type { CreateWarehouseInput, UpdateWarehouseInput, Warehouse }
